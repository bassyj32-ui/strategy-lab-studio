// AI COMMANDER EXECUTOR (§53–§61). Orchestrates one command cycle:
//   commander prompt + summarized scene (§62) → provider → proposed ops
//   → VALIDATION (ai/tools.ts) → human approval (UI gate) → ONE store
//   transaction labeled "AI Change #N" (§60/§61).
// The executor NEVER applies anything itself and NEVER touches rendering —
// the only write path is the store's approval-gated applyAIBatch.
import { summarizeScene } from '../scene/selectors';
import type { Scene } from '../scene/types';
import {
  resolveOps,
  TOOL_SPECS,
  type ProposedOp,
  type ResolvedOp,
} from './tools';
import type { AIProvider, AISettings } from './provider';

export interface CommandContext {
  scene: Scene;
  selectedObjId?: string | null;
  selectedIds?: string[];
}

/** The result of one command cycle, ready for the approval UI. */
export interface Proposal {
  /** Provider prose explaining the plan (may be empty). */
  text: string;
  /** Validated ops awaiting approval. */
  resolved: ResolvedOp[];
  /** Human-readable one-liners for the proposal cards. */
  summaries: string[];
  /** Rejected proposals with reasons (schema/bounds violations). */
  errors: string[];
}

function systemPrompt(scene: Scene): string {
  return [
    'You are the AI Commander of Strategy Lab, a deterministic battlefield',
    'animation editor. You assist a human commander who holds final authority.',
    'Rules you MUST follow:',
    '- Propose edits ONLY through the provided tools; never invent tool names.',
    '- Use explicit world coordinates and explicit timeline times.',
    '- Reference existing objects by their id or exact label from the summary.',
    '- Historical facts are the commander\'s responsibility: propose visual',
    '  staging, never assert truth.',
    '- You cannot render video or decide historical truth.',
    '- Prefer few, clear ops per response. Explain your plan briefly in prose',
    '  alongside any tool calls.',
    '',
    `Scene timeline: ${scene.timeline.duration}s at ${scene.timeline.fps}fps.`,
    `World size: ${scene.worldSize.w} x ${scene.worldSize.h} units.`,
  ].join('\n');
}

/**
 * Run one command cycle: summarize → ask provider → validate proposals.
 * Purely read-side: nothing here mutates the scene. Throws on transport
 * failure (the UI catches and shows the sanitized error message).
 */
export async function requestProposal(
  provider: AIProvider,
  settings: AISettings,
  prompt: string,
  ctx: CommandContext
): Promise<Proposal> {
  const summary = summarizeScene(ctx.scene, {
    selectedObjId: ctx.selectedObjId,
    selectedIds: ctx.selectedIds,
  });

  const userContent = [
    `Commander's order: ${prompt}`,
    '',
    'Current summarized scene state (JSON):',
    JSON.stringify(summary),
  ].join('\n');

  const result = await provider.complete(
    {
      messages: [
        { role: 'system', content: systemPrompt(ctx.scene) },
        { role: 'user', content: userContent },
      ],
      tools: TOOL_SPECS,
    },
    settings
  );

  // Validation BEFORE anything else: malformed/out-of-bounds proposals are
  // rejected harmlessly here and reported back to the commander.
  const { resolved, errors } = resolveOps(result.proposals as ProposedOp[], ctx.scene);

  return {
    text: result.text,
    resolved,
    summaries: resolved.map((op) => describeOp(op)),
    errors,
  };
}

/** Short human-readable description used by the proposal cards. */
export function describeOp(op: ResolvedOp): string {
  switch (op.tool) {
    case 'create_object':
      return `Create ${op.type}${op.label ? ` "${op.label}"` : ''} at (${op.x}, ${op.y})`;
    case 'move_objects':
      return op.x !== undefined && op.y !== undefined
        ? `Move object to (${Math.round(op.x)}, ${Math.round(op.y)})`
        : `Move ${op.ids.length} object(s) by (${op.dx ?? 0}, ${op.dy ?? 0})`;
    case 'update_object_props':
      return `Update properties of ${op.id}`;
    case 'group_objects':
      return `Group ${op.ids.length} objects`;
    case 'ungroup_object':
      return `Ungroup ${op.id}`;
    case 'create_formation':
      return `${op.pattern} formation (${op.count ?? 5}) at (${op.x}, ${op.y})`;
    case 'set_camera_keyframe':
      return `Camera keyframe @ ${op.time}s`;
    case 'apply_camera_preset':
      return `Camera preset: ${op.kind}`;
    case 'trigger_decisive_move':
      return 'Decisive move macro';
    case 'trigger_why_it_worked':
      return 'Why-it-worked macro';
    case 'trigger_signature_opening':
      return 'Signature opening card';
    case 'toggle_closing_card':
      return `${op.on ? 'Enable' : 'Disable'} closing card`;
    case 'set_vignette':
      return `${op.on ? 'Enable' : 'Disable'} vignette`;
    case 'update_brand':
      return 'Brand metadata update';
  }
}
