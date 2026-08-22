---
description: Implement a Strategy Lab Studio feature with the BUILDER (edits source, runs npm run check, cannot push or edit frozen files).
agent: builder
---

Build the following Strategy Lab Studio (MVP-1) work using the BUILDER agent.

Request: $ARGUMENTS

Scope check: P0 / MVP-1 only. The BUILDER implements the smallest change that
satisfies the request, then runs `npm run check` (typecheck + lint + unit +
build) and iterates until it is GREEN. The BUILDER cannot push to git and
cannot edit `docs/prd.md` or `AGENTS.md`. Report the result and the check
status.
