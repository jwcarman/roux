package org.jwcarman.roux.examples.dojo.memberships;

import java.time.LocalDate;
import java.util.UUID;

import org.jwcarman.roux.money.Money;

/** A payment on the Payments page. */
public record PaymentListEntry(
    UUID id,
    LocalDate takenOn,
    UUID studentId,
    String studentName,
    String planName,
    int periods,
    Money amount,
    PaymentMethod method,
    String recordedByName) {}
