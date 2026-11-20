package org.jwcarman.roux.examples.dojo.plans;

import java.util.UUID;

import org.jwcarman.roux.money.Money;

/**
 * A plan as the app shows it; {@code inUse} once a membership has used it (it can then only be made
 * inactive).
 */
public record Plan(
    UUID id,
    String name,
    Money price,
    PlanPeriod period,
    boolean active,
    boolean inUse,
    long version) {

  public static Plan of(PlanEntity entity, boolean inUse) {
    return new Plan(
        entity.getId(),
        entity.getName(),
        entity.getPrice(),
        entity.getPeriod(),
        entity.isActive(),
        inUse,
        entity.getVersion());
  }
}
