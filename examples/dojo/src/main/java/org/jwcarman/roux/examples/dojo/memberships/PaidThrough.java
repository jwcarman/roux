package org.jwcarman.roux.examples.dojo.memberships;

import java.time.LocalDate;

import org.jwcarman.roux.examples.dojo.plans.PlanPeriod;

/**
 * The last day a membership is paid for: its start, plus the periods paid as whole months or years
 * added at once, minus a day. Nothing paid is the day before the start. The {@code
 * membership_paid_through} view computes the same; the two must agree.
 */
public final class PaidThrough {

  private PaidThrough() {}

  public static LocalDate of(LocalDate start, PlanPeriod period, int periods) {
    LocalDate end =
        period == PlanPeriod.YEARLY ? start.plusYears(periods) : start.plusMonths(periods);
    return end.minusDays(1);
  }
}
