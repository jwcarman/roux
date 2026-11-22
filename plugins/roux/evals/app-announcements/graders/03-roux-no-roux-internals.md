---
type: llm
focus: trace
weight: 1
---

Every import of roux-web the agent added names one of its subpath exports (`@jwcarman/roux-web/api`, `/form`, `/table` and the rest its package.json lists), never a path inside it such as `dist/` or `src/`.
