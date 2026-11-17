---
type: llm
focus: trace
weight: 1
---

(roux arms only) The run imports roux-web only through its six entry points (`@jwcarman/roux-web/problem`, `/api`, `/paging`, `/table`, `/feedback`, `/form`), never from its `dist/` or `src/`. `plugins/roux/scripts/check-roux-way.sh` on the result prints `PASS no-roux-internals`.
