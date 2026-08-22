# Decisions — Strategy Lab Internal Studio

> Every architectural or scope choice is recorded here with a date and the
> reason. When in doubt, this log is the authority on *why* something is the
> way it is. New decisions go at the TOP (newest first).

## 2026-08-22 — Agent system structure locked (MVP-1)

- **Decision:** Build a lean agent set — MAIN (primary) + ARCHITECT + BUILDER +
  REVIEWER. Skip DATABASE / SECURITY / DEPLOYMENT agents until Supabase (P3).
- **Reason:** User's full proposal (MAIN→ARCHITECT/BUILDER/REVIEWER→
  DATABASE/FRONTEND/SECURITY→DEBUGGER→QA) is over-scaled for an MVP-1 solo
  project. DEBUG/QA become skills/loops, not separate agents.
- **Consequence:** DEBUG = `diagnosing-bugs` skill; QA = `testing` skill.
  RENDER/EDITOR agents added in MVP-2+.

## 2026-08-22 — Package manager = npm

- **Decision:** Use **npm**; verification command is `npm run check`
  (typecheck + lint + unit + build).
- **Reason:** Simplest for the internal tool; user approved.

## 2026-08-22 — Agents are project-scoped

- **Decision:** Define agents/commands in `strategy-lab-studio/.opencode/`
  (not global `~/.config/opencode/`).
- **Reason:** Agent definitions belong to this repo's frozen requirements.

## 2026-08-22 — /docs skeleton filled now

- **Decision:** Create `architecture.md`, `decisions.md`, `rendering.md`
  at MVP-1 start (not deferred).
- **Reason:** Knowledge base must exist before coding; `decisions.md` is the
  critical record.

## 2026-08-22 — Freeze protection on requirements

- **Decision:** BUILDER's `edit` permission is **denied** on `docs/prd.md`
  and `AGENTS.md`.
- **Reason:** Requirements are frozen (PRD v1.0). No agent silently changes
  the laws. Pushes to git are also denied for BUILDER.

## 2026-08-22 — "DONE" means green checks

- **Decision:** The PLAN→IMPLEMENT→TEST→DEBUG→REVIEW→DONE loop ends at DONE
  only when `npm run check` is green. "Files written" is not completion.
- **Reason:** Verification over false confidence (user point #4/#5).

## 2026-08-22 — Scope-guard against the 117-requirement trap

- **Decision:** MAIN prompt + AGENTS.md reject any P1–P3 feature pull-forward
  during MVP-1. Build P0 first.
- **Reason:** PRD §117 freeze warning — do not hand the coding agent 117
  requirements at once.

## Stack choices (carried from PRD, confirmed for MVP-1)

- React + TypeScript (strict); react-konva canvas; Zustand + Immer;
  Remotion + FFmpeg rendering. Supabase optional, P3 only.
- Canvas: **react-konva** chosen over PixiJS (final confirmation pending —
  see architecture.md §2). If switched, record a new decision here.
