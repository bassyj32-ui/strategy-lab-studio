---
description: Debug a Strategy Lab Studio issue with the BUILDER using the diagnosing-bugs loop.
agent: builder
---

Debug the following Strategy Lab Studio (MVP-1) issue using the BUILDER agent
and the diagnosing-bugs skill workflow.

Issue: $ARGUMENTS

Run the diagnosis loop: reproduce, isolate the root cause, propose the minimal
fix, implement it, then verify with `npm run check` (green). Keep changes
minimal and inside MVP-1 scope. The BUILDER cannot push to git.
