package org.jwcarman.roux.examples.dojo.plans;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import org.jwcarman.roux.money.InCurrency;
import org.jwcarman.roux.money.Money;
import org.jwcarman.roux.money.PositiveMoney;

/** A plan as the Plans page sends it; {@code version} is null for a new one. */
public record PlanRequest(
    @NotBlank @Size(max = PlanEntity.MAX_NAME) String name,
    @NotNull @PositiveMoney @InCurrency Money price,
    @NotNull PlanPeriod period,
    @NotNull Boolean active,
    Long version) {}
