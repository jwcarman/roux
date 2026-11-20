package org.jwcarman.roux.examples.dojo.memberships;

import java.time.LocalDate;
import java.util.UUID;

import org.jwcarman.roux.money.Money;

/** A payment on a student's page; {@code recordedByName} is the member's name, or "Unknown". */
public record PaymentView(
    UUID id,
    LocalDate takenOn,
    int periods,
    Money amount,
    PaymentMethod method,
    String note,
    String recordedByName) {}
