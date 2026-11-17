---
type: llm
focus: trace
weight: 1
---

(roux arms only) The run adds no `@ExceptionHandler` and no `ResponseStatusException` under `src/main/java`: errors are thrown as roux's exceptions (`NotFoundException`, `InvariantViolationException`, `InvalidFieldException`) and answered as Problem Details. `plugins/roux/scripts/check-roux-way.sh` on the result prints `PASS no-exception-handler`.
