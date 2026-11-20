package org.jwcarman.roux.examples.dojo.memberships;

import java.time.LocalDate;
import java.util.UUID;

import jakarta.validation.constraints.NotNull;

/**
 * Puts a student on a plan from {@code startDate} (which may be ahead: a change when paid time runs
 * out).
 */
public record MembershipRequest(@NotNull UUID planId, @NotNull LocalDate startDate) {}
