package org.jwcarman.roux.examples.dojo.students;

import java.time.LocalDate;
import java.util.UUID;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;

/** A promotion to record: the rank, and the day, which may not be in the future. */
public record PromotionRequest(@NotNull UUID rankId, @NotNull @PastOrPresent LocalDate date) {}
