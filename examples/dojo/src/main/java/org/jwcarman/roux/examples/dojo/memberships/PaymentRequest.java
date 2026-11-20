package org.jwcarman.roux.examples.dojo.memberships;

import java.time.LocalDate;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import org.jwcarman.roux.validation.NotInFuture;

/**
 * A payment as the desk records it; the amount is the server's (the plan's price times periods).
 */
public record PaymentRequest(
    @NotNull @Min(1) @Max(12) Integer periods,
    @NotNull @NotInFuture LocalDate takenOn,
    @NotNull PaymentMethod method,
    @Size(max = PaymentEntity.MAX_NOTE) String note) {

  public PaymentRequest {
    note = note == null || note.isBlank() ? null : note.strip();
  }
}
