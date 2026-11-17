---
type: llm
focus: trace
weight: 1
---

(roux arms only) No file the run added or changed under `frontend/src`, tests aside, calls `fetch(` itself: requests go through roux-web's client (`getJson`, `sendJson` from `@jwcarman/roux-web/api`). `plugins/roux/scripts/check-roux-way.sh` on the result prints `PASS no-fetch`.
