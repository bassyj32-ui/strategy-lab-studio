// Strategy Lab Studio — Export Bridge (server-side render orchestration).
//
// Pure Node ES module. Deliberately contains NO React / Remotion imports so it
// can run in any Node context (Vite dev-server middleware, future CLI). It only
// spawns the EXISTING `@remotion/cli` binary as a child process — it never
// invents new render math, and all rendering stays Remotion → FFmpeg, outside
// the browser (per PRD §66, §68).
//
// Allowed modules only: node:child_process, node:fs, node:path.

import { spawn } from 'node:child_process';
import {
  mkdirSync,
  writeFileSync,
  createReadStream,
  existsSync,
  statSync,
  realpathSync,
} from 'node:fs';
import { resolve, sep, basename } from 'node:path';

// Maximum accepted POST body (scene JSON). A scene this large is not supported
// and would exhaust memory; reject early (minor #9).
const MAX_BODY_BYTES = 64 * 1024 * 1024;

// Cap accumulated child stderr so long renders can't grow memory unbounded
// (minor #8).
const MAX_STDERR_BYTES = 50_000;

const VALID_MODES = ['mp4', 'prores', 'webm', 'sequence'];

/** Absolute path to the render output directory (cwd/out). */
function outDir() {
  return resolve(process.cwd(), 'out');
}

/**
 * Resolve the remotion binary: prefer the local install
 * (node_modules/.bin/remotion, or .cmd on Windows); fall back to `npx` which
 * will resolve the package from the local node_modules.
 */
function resolveRemotionBin() {
  const binName = process.platform === 'win32' ? 'remotion.cmd' : 'remotion';
  const local = resolve(process.cwd(), 'node_modules', '.bin', binName);
  if (existsSync(local)) return local;
  return 'npx';
}

/**
 * Build the remotion CLI argument list for a given export mode.
 *
 * Alpha modes (prores, webm, sequence) target the **`BattleSceneAlpha`**
 * Composition, which FORCES transparent/overlay paint internally (a `--props`
 * file replaces props wholesale and would otherwise silently fall back to
 * standard mode). mp4 targets `BattleScene` for the opaque, deterministic MP4.
 * Both compositions read the SAME scene model and paint through the same
 * deterministic `drawScene()` — a single source of truth for frames
 * (PRD §65, §99; see docs/rendering.md §3).
 */
export function buildRenderArgs(mode, propsPath) {
  const bin = resolveRemotionBin();
  const out = outDir();
  let args;
  let outputPath;

  switch (mode) {
    case 'mp4':
      // The bridge INTENTIONALLY adds `--props=out/export.props.json` so the
      // render uses the LIVE editor scene. (The bare `npm run render` script
      // uses Remotion's default props instead.) The scene model stays the
      // single source of truth (PRD §65, §99).
      outputPath = resolve(out, 'video.mp4');
      args = [
        'render',
        'src/render/index.ts',
        'BattleScene',
        'out/video.mp4',
        '--props=' + propsPath,
      ];
      break;
    case 'prores':
      outputPath = resolve(out, 'overlay.mov');
      args = [
        'render',
        'src/render/index.ts',
        'BattleSceneAlpha',
        'out/overlay.mov',
        '--props=' + propsPath,
        '--image-format=png',
        '--pixel-format=yuva444p10le',
        '--codec=prores',
        '--prores-profile=4444',
      ];
      break;
    case 'webm':
      outputPath = resolve(out, 'overlay.webm');
      args = [
        'render',
        'src/render/index.ts',
        'BattleSceneAlpha',
        'out/overlay.webm',
        '--props=' + propsPath,
        '--image-format=png',
        '--pixel-format=yuva420p',
        '--codec=vp9',
      ];
      break;
    case 'sequence':
      outputPath = resolve(out, 'overlay-frames');
      args = [
        'render',
        'src/render/index.ts',
        'BattleSceneAlpha',
        'out/overlay-frames',
        '--props=' + propsPath,
        '--image-format=png',
        '--sequence',
      ];
      break;
    default:
      throw new Error(`Unknown export mode: ${mode}`);
  }

  return { bin, args, outputPath };
}

/**
 * Parse accumulated Remotion stderr into progress state.
 *
 * `buffer` is the latest stderr chunk; `carry` is the state returned by the
 * previous call (holds the unparsed tail of a line split across chunks, plus
 * the max frame seen). Returns an updated carry that also exposes the latest
 * parsed `{ frame, total, progress, stage, done, error }` for callers.
 */
export function parseRemotionProgress(buffer, carry = {}) {
  const c = {
    tail: '',
    maxFrame: 0,
    total: 0,
    frame: 0,
    progress: 0,
    stage: 'rendering',
    done: false,
    error: null,
    ...carry,
  };

  const combined = (c.tail ?? '') + (buffer ?? '');
  // A line is only "complete" once we see a terminator. If the combined
  // buffer does NOT end in \r/\n, the final segment is an incomplete line and
  // must be held back as the tail for the next chunk. This also re-assembles a
  // single logical line that arrives split across two `data` events.
  const endsWithNewline = /[\r\n]$/.test(combined);
  const parts = combined.split(/\r|\n/);
  c.tail = endsWithNewline ? '' : parts.pop() ?? '';

  for (const raw of parts) {
    const line = raw.trim();
    if (!line) continue;

    // Genuine error lines only — e.g. "Error: boom" or "error: ...". We do NOT
    // flag every line that merely contains the word "error" (Remotion prints
    // benign lines that include it), otherwise benign output would freeze all
    // progress reporting (blocker #4).
    if (/^error\b/i.test(line)) {
      c.error = line;
      continue;
    }

    // e.g. "Rendering frame 12/300" (older) or "Rendered 12/300" / "Rendered 12/60" (remotion 4.x)
    let m = line.match(/Rendering frame\s+(\d+)\s*\/\s*(\d+)/i);
    if (!m) m = line.match(/Rendered\s+(\d+)\s*\/\s*(\d+)/i);
    if (m) {
      // Progress is flowing — clear any stale error flag so a prior benign
      // error line can't keep blocking the stream.
      c.error = null;
      const f = parseInt(m[1], 10);
      const t = parseInt(m[2], 10);
      c.frame = f;
      c.total = t;
      c.maxFrame = Math.max(c.maxFrame, f);
      c.progress = t > 0 ? f / t : 0;
      c.stage = 'rendering';
      continue;
    }
    // e.g. "Encoded 37/60"
    const enc = line.match(/Encoded\s+(\d+)\s*\/\s*(\d+)/i);
    if (enc) {
      c.error = null;
      const f = parseInt(enc[1], 10);
      const t = parseInt(enc[2], 10);
      c.frame = f;
      c.total = t;
      c.maxFrame = Math.max(c.maxFrame, f);
      c.progress = t > 0 ? f / t : 0;
      c.stage = 'encoding';
      continue;
    }

    // e.g. "Progress: 50%"
    const p = line.match(/Progress:\s*(\d+(?:\.\d+)?)\s*%/i);
    if (p) {
      // Same reset as above: progress lines clear a stale error flag.
      c.error = null;
      c.progress = parseFloat(p[1]) / 100;
      c.stage = 'rendering';
      continue;
    }

    // Catch common Remotion failure modes that don't start with "error":
    // "ffmpeg was not found", "No usable sandbox", "Could not find Chrome", etc.
    if (
      /ffmpeg\s+(was\s+not\s+found|not\s+found|is\s+not\s+installed)/i.test(line) ||
      /could\s+not\s+find\s+chrome/i.test(line) ||
      /no\s+usable\s+sandbox/i.test(line)
    ) {
      c.error = line;
      continue;
    }
  }

  return c;
}

// Module-level handle to the active export job (used for cancellation).
let activeJob = null;

/**
 * Start a server-side Remotion export for a single active scene.
 *
 * `emit(ev)` is called for each SSE event: {type:'start'|'progress'|'done'|
 * 'error'|'cancelled'}. Rendering runs as a detached child process — never
 * inside the browser (PRD §68).
 */
export async function startExport({ scene, mode, emit } = {}) {
  if (!VALID_MODES.includes(mode)) {
    throw new Error(`Unknown export mode: ${mode}`);
  }

  const out = outDir();
  mkdirSync(out, { recursive: true });

  // Standard mode → opaque MP4; every other mode → alpha overlay footage.
  const exportMode = mode === 'mp4' ? 'standard' : 'alpha';
  // mp4 keeps `out/export.props.json`; alpha modes use
  // `out/scene.alpha.props.json` (matches the package.json alpha-script
  // convention — minor #6). The props file content is identical
  // `{ scene, exportMode }`; the composition choice alone drives alpha paint.
  const propsName = mode === 'mp4' ? 'export.props.json' : 'scene.alpha.props.json';
  const propsPath = resolve(out, propsName);
  writeFileSync(propsPath, JSON.stringify({ scene, exportMode }));

  const timeline = scene?.timeline ?? {};
  const fps = timeline.fps ?? 30;
  const duration = timeline.duration ?? 0;
  const totalFrames = Math.round(duration * fps);

  const { bin, args, outputPath } = buildRenderArgs(mode, propsPath);
  // `npx` needs the package name as its first arg; the local bin does not.
  const spawnArgs = bin === 'npx' ? ['remotion', ...args] : args;

  const child = spawn(bin, spawnArgs, { cwd: process.cwd() });

  let stderr = '';
  let carry = { stage: 'rendering' };

  activeJob = { child, emit, cancelled: false };

  emit?.({ type: 'start', mode, outputPath, totalFrames });

  const onProgressChunk = (chunk) => {
    const text = chunk.toString();
    // Cap accumulated stderr so long renders can't grow memory unbounded
    // (minor #8).
    stderr = (stderr + text).slice(-MAX_STDERR_BYTES);
    carry = parseRemotionProgress(text, carry);
    // Never suppress progress on a (possibly stale) error flag — a prior
    // benign error line must not freeze the stream (blocker #4).
    emit?.({
      type: 'progress',
      progress: carry.progress,
      stage: carry.stage,
    });
  };
  child.stderr?.on('data', onProgressChunk);
  child.stdout?.on('data', onProgressChunk);

  child.on('close', (code) => {
    if (!activeJob || activeJob.child !== child) return;
    if (activeJob.cancelled) {
      emit?.({ type: 'cancelled' });
    } else if (code !== 0) {
      const tail = stderr
        .split(/\r|\n/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(-20)
        .join('\n');
      emit?.({
        type: 'error',
        message: `Remotion exited with code ${code}\n${tail}`,
      });
    } else {
      emit?.({ type: 'done', outputPath });
    }
    activeJob = null;
  });

  child.on('error', (err) => {
    if (!activeJob || activeJob.child !== child) return;
    emit?.({ type: 'error', message: err.message });
    activeJob = null;
  });

  return { child, outputPath };
}

/**
 * Cancel the active export. Sends SIGTERM, then SIGKILL after ~1.5s if the
 * process is still alive. The `cancelled` flag makes the close handler emit a
 * `cancelled` event rather than an `error`.
 */
export function cancelExport() {
  if (!activeJob || !activeJob.child) return;
  activeJob.cancelled = true;
  const child = activeJob.child;
  child.kill('SIGTERM');
  setTimeout(() => {
    if (!child.killed) {
      child.kill('SIGKILL');
    }
  }, 1500);
}

/**
 * Connect-style request handlers for the Vite dev/preview server.
 *   POST /api/export         — start an SSE-streamed export
 *   POST /api/export/cancel  — cancel the active export
 *   GET  /api/export/file    — download a finished artifact (?name=...)
 */
export function createExportHandlers() {
  const SSE_HEADERS = {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  };

  function exportHandler(req, res, next) {
    if (req.method !== 'POST') return next();

    let body = '';
    let responded = false;

    // Reject pathologically large payloads before they exhaust memory (minor
    // #9). Once over the cap we stop reading and return 400.
    req.on('data', (chunk) => {
      if (responded) return;
      if (body.length > MAX_BODY_BYTES) {
        responded = true;
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
        req.destroy();
        return;
      }
      body += chunk.toString();
    });
    req.on('end', () => {
      console.log('[exportBridge] end body', body.length, 'bytes');
      if (responded) return;
      let parsed;
      try {
        parsed = JSON.parse(body || '{}');
      } catch (e) {
        console.log('[exportBridge] invalid JSON', e.message);
        responded = true;
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        return;
      }
      const { scene, mode } = parsed;
      console.log('[exportBridge] parsed mode', mode, 'scene', scene?.id, 'objects', scene?.objects ? Object.keys(scene.objects).length : 0, 'timeline', scene?.timeline);
      if (!scene || !mode) {
        console.log('[exportBridge] missing scene or mode');
        responded = true;
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'scene and mode are required' }));
        return;
      }

      res.writeHead(200, SSE_HEADERS);
      // emit writes one SSE event and ENDS the response on a terminal event
      // (done/error/cancelled) so the client reader loop can always exit
      // (blocker #1). Every write is guarded against a closed stream.
      const emit = (ev) => {
        if (res.writableEnded) return;
        res.write('data: ' + JSON.stringify(ev) + '\n\n');
        if (
          ev.type === 'done' ||
          ev.type === 'error' ||
          ev.type === 'cancelled'
        ) {
          res.end();
        }
      };

      startExport({ scene, mode, emit }).catch((err) => {
        emit({
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      });
    });
    req.on('error', () => {
      /* ignore transport errors; close handler will clean up */
    });
    // IMPORTANT: do NOT use req.on('close') — Node fires IncomingMessage
    // 'close' immediately after 'end' (request body fully consumed), even
    // though the response (SSE) is still open. That would cancel every
    // export right after start. Listen on res instead and only cancel if
    // the response was aborted before a terminal event.
    res.on('close', () => {
      if (!res.writableEnded) cancelExport();
    });
  }

  function cancelHandler(req, res) {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }
    cancelExport();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ cancelled: true }));
  }

  function fileHandler(req, res, next) {
    if (req.method !== 'GET') return next?.();
    const url = new URL(req.url || '', 'http://localhost');
    const name = url.searchParams.get('name') || '';
    if (!name) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'name query parameter required' }));
      return;
    }

    const out = outDir();
    const target = resolve(out, name);

    // Resolve both the out dir and the target to their real (symlink-free)
    // absolute paths, then assert the target really lives inside out. This
    // closes a symlink-escape path-traversal vector (#7).
    let outReal;
    let targetReal;
    try {
      outReal = realpathSync(out);
      targetReal = realpathSync(target);
    } catch {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    if (targetReal !== outReal && !targetReal.startsWith(outReal + sep)) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }
    if (!existsSync(targetReal)) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    if (statSync(targetReal).isDirectory()) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Directory not served' }));
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${basename(target)}"`,
    });
    createReadStream(targetReal).pipe(res);
  }

  return { exportHandler, cancelHandler, fileHandler };
}
