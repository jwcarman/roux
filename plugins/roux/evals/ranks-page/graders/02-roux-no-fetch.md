---
type: llm
focus: trace
weight: 1
---

No frontend code the agent added calls `fetch` directly; its requests go through roux-web's client (`getJson`, `sendJson` from `@jwcarman/roux-web/api`) or the feature module built on it.
