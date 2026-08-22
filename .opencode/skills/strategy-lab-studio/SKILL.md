---
name: strategy-lab-studio
description: Use ONLY when working inside the strategy-lab-studio repository. Contains product identity, frozen-requirements laws, and conventions for Strategy Lab Internal Studio.
---

# Strategy Lab Studio — Project Brain

## What this is
A deterministic, commander-controlled 2D/2.5D **battlefield animation editor** (web app).
It is **NOT an AI video generator**. Creator imports clean maps, places/animates every
tactical element, controls camera/timeline/exports manually or via structured AI commands,
then renders deterministic footage for finishing in CapCut/DaVinci.
Repo: github.com/bassyj32-ui/strategy-lab-studio (private)

## Hard laws (from frozen PRD v1.0)
- Scene model = SINGLE SOURCE OF TRUTH (editor, AI, save/load, Remotion all share it)
- Separation forever: ASSETS vs ANIMATION vs RENDERING — never bake into maps/video
- Every object has a unique ID, stays independently editable after animation
- AI = optional assistive layer; acts ONLY via tool calls on structured scene data
- AI NEVER renders, never overwrites keyframes without approval, never decides history
- Build P0/MVP-1 first; do NOT pull P1–P3 features forward uninvited
- No SaaS infra: no billing/public signup/teams/marketplace
- Render path = Remotion + FFmpeg ONLY, outside the web request lifecycle
- Canvas: react-konva (pending final confirmation) — never hundreds of React DOM objects

## Stack (confirmed for MVP-1)
- React + TypeScript (strict)
- react-konva canvas scene-graph (final confirmation pending, but MVP-1 proceeds on react-konva)
- Remotion + FFmpeg rendering (only path)
- Zustand + Immer transactional state
- Supabase optional (auth/backup only, not engine dependency; P3)
- Package manager: npm (`npm run check`)

## Current status
- PRD v1.0: frozen, in docs/prd.md (2065 lines, 117 sections). Do NOT edit.
- AGENTS.md: written at repo root with the full rule set.
- Agent system BUILT (MVP-1): MAIN (primary) + ARCHITECT + BUILDER + REVIEWER
  subagents, plus /plan /build /review /debug /test commands. Defined in
  `.opencode/`. Permissions enforce freeze (BUILDER cannot edit prd.md/AGENTS.md
  or push to git).
- Knowledge base filled: docs/architecture.md, docs/decisions.md,
  docs/rendering.md.
- Phase: MVP-1 scaffolding pending — first BUILDER task is to scaffold the
  React+TS project and wire `npm run check`.

## Conventions
- Follow the git-workflow skill (conventional commits)
- Owner prefers being called "boss"; keep explanations simple and beginner-friendly
- Ask before big architectural decisions
- Do NOT push to git until the owner explicitly says so
