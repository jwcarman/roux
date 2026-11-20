package org.jwcarman.roux.examples.dojo.memberships;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.jwcarman.roux.examples.dojo.plans.PlanPeriod;

class PaidThroughTest {

  @Test
  void nothingPaidIsTheDayBeforeTheStart() {
    assertThat(PaidThrough.of(LocalDate.parse("2026-03-15"), PlanPeriod.MONTHLY, 0))
        .isEqualTo("2026-03-14");
  }

  @Test
  void eachMonthlyPeriodAddsAMonth() {
    assertThat(PaidThrough.of(LocalDate.parse("2026-03-15"), PlanPeriod.MONTHLY, 1))
        .isEqualTo("2026-04-14");
    assertThat(PaidThrough.of(LocalDate.parse("2026-03-15"), PlanPeriod.MONTHLY, 3))
        .isEqualTo("2026-06-14");
  }

  @Test
  void aMonthEndStartAddsWholeMonthsAtOnce() {
    assertThat(PaidThrough.of(LocalDate.parse("2026-01-31"), PlanPeriod.MONTHLY, 1))
        .isEqualTo("2026-02-27");
    assertThat(PaidThrough.of(LocalDate.parse("2026-01-31"), PlanPeriod.MONTHLY, 2))
        .isEqualTo("2026-03-30");
  }

  @Test
  void eachYearlyPeriodAddsAYear() {
    assertThat(PaidThrough.of(LocalDate.parse("2024-02-29"), PlanPeriod.YEARLY, 1))
        .isEqualTo("2025-02-27");
  }
}
