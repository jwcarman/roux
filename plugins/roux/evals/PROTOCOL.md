# Eval protocol: does the roux skill save time and money, and let a cheaper model do the work?

Written and committed before the measured run, so nothing below is chosen after seeing results.
The skill, the case, the fixture and the scoring are frozen at the commit that adds this file.

## Questions

1. **Efficiency.** Does the skill let an agent reach a working result in fewer turns, less time
   and less money? Better code is not claimed: the app template's gates (Spotless, 100% JaCoCo and
   Vitest coverage, PermissionsTest) push any agent toward the right way.
2. **A cheaper model.** Does the skill let Haiku succeed about as often as Sonnet without it?

## Design

- **Case:** `app-locations` only: a Locations page and API on a new app made from roux's app
  template (`eval-fixture.sh --app`, at the commit that adds this file).
- **Arms:** Sonnet with the skill, Sonnet without, Haiku with the skill, Haiku without
  (`claude plugin eval --ablation with-without --model <sonnet|haiku>`).
- **Runs:** 3 per arm, 12 in all. Every run is reported; none is rerun or dropped. A run that errors
  or times out counts as a failure, with whatever turns, time and cost it used.

## Scoring (by script, no LLM judge)

A run **succeeds** when both gates pass on its work:

1. **Acceptance:** all 10 hidden tests in `app-locations/acceptance` pass (`eval-acceptance.sh`): 8
   Spring tests of the API contract the prompt pins, and 2 Playwright tests in the browser. The
   agent cannot read them (the sandbox lets it read only the skill's own folder).
2. **Build:** the app's own `./mvnw verify -DskipITs` passes (`check-roux-way.sh`'s `build`),
   with nothing applied after the run (no `spotless:apply`). The agent's sandbox has no Docker, so
   it cannot run the Java tests itself; that holds equally for every arm.

Reported per arm: successes out of 3; each gate's pass count; mean and range of turns, time
(seconds) and cost (USD, API-equivalent, as `claude plugin eval` reports it); whether the skill
fired (with-arms); and check-roux-way's roux-way checks, for information only.

## What would support each claim

Written now; with 3 runs per arm the result is a signal, not proof.

- **Efficiency:** Sonnet with the skill succeeds at least as often as Sonnet without, at a lower
  mean cost and time.
- **A cheaper model:** Haiku with the skill succeeds at least as often as Sonnet without, at a
  lower mean cost; and more often than Haiku without.

Anything else is reported as not supported. A claim that is supported is followed by more runs of
this case before any wider claim.

## Caveat

The person who wrote the skill also wrote the case and its hidden tests. The case is an ordinary
feature request of the kind roux's users send, and its contract is pinned in the prompt so the
hidden tests can check it, which may make the task easier for both arms alike.

## Result of the measured run (fixture at d8443ee)

| Arm | Successes | Mean turns | Mean time | Mean cost |
|---|---|---|---|---|
| Sonnet, no skill | 0 of 3 | 39 | 206 s | $0.88 |
| Sonnet + skill | 2 of 3 | 33 | 163 s | $0.77 |
| Haiku, no skill | 1 of 3 | 65 | 396 s | $0.56 |
| Haiku + skill | 3 of 3 | 56 | 265 s | $0.37 |

Every run passed all 10 hidden tests; the build decided success. Both claims were supported, as a
signal. (The skill-fired grader also passed in two Sonnet no-skill runs, which called a `roux`
skill that did not exist; it is not part of the scoring.)

## Follow-up (written before it runs)

Same case, fixture, skill and scoring as above, with no change but the driver's `--ablation`
option. 5 more runs each of Haiku + skill (`--ablation none --model haiku`) and of the Sonnet pair
(`--ablation with-without --model sonnet`: the eval has no way to run only its no-skill arm, so
Sonnet + skill runs too and is reported). Every run is reported.

The cheaper-model claim stands if, over all 8 runs of each arm (the 3 above and these 5), Haiku +
skill succeeds at least as often as Sonnet without the skill, at a lower mean cost. The efficiency
claim stands if, over all 8, Sonnet + skill succeeds at least as often as Sonnet without, at a lower
mean cost and time. The follow-up's 5 runs are also reported on their own.
