// Client-side hook that drives the one-click export.
//
// It POSTs the active scene to the dev-server export bridge (which runs
// Remotion server-side) and consumes the Server-Sent-Events progress stream.
// All rendering happens outside the browser — this hook only reads state.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSceneStore } from '../scene/store';

export type ExportStatus = 'idle' | 'running' | 'done' | 'error' | 'cancelled';

export interface ExportEvent {
  type: 'start' | 'progress' | 'done' | 'error' | 'cancelled';
  progress?: number;
  stage?: string;
  mode?: string;
  outputPath?: string;
  message?: string;
}

export interface UseExportResult {
  start: (mode: string) => void;
  cancel: () => void;
  progress: number;
  stage?: string;
  status: ExportStatus;
  outputPath?: string;
  error?: string;
}

export function useExport(): UseExportResult {
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<string | undefined>(undefined);
  const [outputPath, setOutputPath] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const applyEvent = useCallback((ev: ExportEvent) => {
    switch (ev.type) {
      case 'start':
        setStatus('running');
        if (ev.outputPath) setOutputPath(ev.outputPath);
        break;
      case 'progress':
        if (typeof ev.progress === 'number') setProgress(ev.progress);
        if (ev.stage) setStage(ev.stage);
        break;
      case 'done':
        setStatus('done');
        if (ev.outputPath) setOutputPath(ev.outputPath);
        break;
      case 'error':
        setStatus('error');
        setError(ev.message || 'Export failed');
        break;
      case 'cancelled':
        setStatus('cancelled');
        break;
    }
  }, []);

  const start = useCallback(
    async (mode: string) => {
      setStatus('running');
      setProgress(0);
      setStage(undefined);
      setError(undefined);
      setOutputPath(undefined);

      // Cancel any in-flight export stream before starting a new one, so a
      // stale reader can't leak or race the new run (blocker #2a).
      const stale = readerRef.current;
      readerRef.current = null;
      if (stale) {
        await stale.cancel().catch(() => {});
      }

      const scene = useSceneStore.getState().scene;
      try {
        const resp = await fetch('/api/export', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode, scene }),
        });
        // Non-200 (or no body) must NOT be read as SSE (blocker #2c).
        if (resp.status !== 200 || !resp.body) {
          const text = await resp.text().catch(() => '');
          setStatus('error');
          setError(
            `Export request failed (HTTP ${resp.status}` +
              (text ? `: ${text}` : '') +
              ')'
          );
          return;
        }

        const reader = resp.body.getReader();
        readerRef.current = reader;
        const decoder = new TextDecoder();
        let buffer = '';

        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let idx: number;
            while ((idx = buffer.indexOf('\n\n')) !== -1) {
              const raw = buffer.slice(0, idx);
              buffer = buffer.slice(idx + 2);
              const dataLine = raw
                .split('\n')
                .find((l) => l.startsWith('data: '));
              if (!dataLine) continue;
              const json = dataLine.slice('data: '.length).trim();
              if (!json) continue;
              let ev: ExportEvent;
              try {
                ev = JSON.parse(json) as ExportEvent;
              } catch {
                continue;
              }
              applyEvent(ev);

              // On a terminal event, stop reading and release the reader so the
              // connection never leaks (blocker #2b). start() then resolves.
              if (
                ev.type === 'done' ||
                ev.type === 'error' ||
                ev.type === 'cancelled'
              ) {
                await reader.cancel().catch(() => {});
                readerRef.current = null;
                return;
              }
            }
          }
        } finally {
          // Safety net: release the reader no matter how we exit the loop.
          await reader.cancel().catch(() => {});
          if (readerRef.current === reader) readerRef.current = null;
        }
      } catch (e) {
        setStatus('error');
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [applyEvent]
  );

  const cancel = useCallback(async () => {
    try {
      await fetch('/api/export/cancel', { method: 'POST' });
    } catch {
      /* ignore — the dialog is closing anyway */
    }
  }, []);

  useEffect(() => {
    return () => {
      readerRef.current?.cancel().catch(() => {});
    };
  }, []);

  return { start, cancel, progress, stage, status, outputPath, error };
}
