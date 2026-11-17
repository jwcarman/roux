---
type: llm
focus: trace
weight: 1
---

(roux arms only) No code the run wrote under `frontend/src`, tests aside, types out one of roux's rule messages (`Must not be blank`, `Must be between 0 and 40 characters` and the like) as a string literal: the rules come from roux's helpers (`text()`, `email()` and the others in `@jwcarman/roux-web/form`). `plugins/roux/scripts/check-roux-way.sh` on the result prints `PASS no-retyped-messages`.
