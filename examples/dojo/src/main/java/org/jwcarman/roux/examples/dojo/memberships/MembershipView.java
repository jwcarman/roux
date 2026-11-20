package org.jwcarman.roux.examples.dojo.memberships;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.jwcarman.roux.examples.dojo.plans.PlanPeriod;
import org.jwcarman.roux.money.Money;

/** A membership on a student's page, with its paid-through date and payments, newest first. */
public record MembershipView(
    UUID id,
    PlanSummary plan,
    LocalDate startDate,
    LocalDate endDate,
    LocalDate paidThrough,
    boolean overdue,
    List<PaymentView> payments) {

  /** The plan a membership is on. */
  public record PlanSummary(UUID id, String name, Money price, PlanPeriod period) {}
}
