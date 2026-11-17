package org.jwcarman.roux.examples.dojo.students;

import java.time.LocalDate;
import java.util.UUID;

import jakarta.validation.constraints.NotNull;

import org.jwcarman.roux.validation.NotInFuture;

/**
 * A promotion to record: the rank, and the day, which may not be in the future ({@link
 * NotInFuture}).
 */
public record PromotionRequest(@NotNull UUID rankId, @NotNull @NotInFuture LocalDate date) {}
