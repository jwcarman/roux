package org.jwcarman.roux.examples.dojo.memberships;

import org.jwcarman.roux.money.Money;

/** Money taken in one month ({@code "2026-04"}), zero when nothing was. */
public record MonthlyTotal(String month, Money total) {}
