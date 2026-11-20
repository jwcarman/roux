package org.jwcarman.roux.examples.dojo.students;

import java.time.LocalDate;
import java.util.UUID;

import org.jwcarman.roux.examples.dojo.ranks.Rank;

/**
 * A student as the list shows them, and as an edit starts from: {@code currentRank} is the rank of
 * the latest promotion, null for a student never promoted.
 */
public record Student(
    UUID id,
    String firstName,
    String lastName,
    String email,
    String phone,
    LocalDate birthDate,
    LocalDate startDate,
    StudentStatus status,
    Rank currentRank,
    long version,
    String planName,
    LocalDate paidThrough,
    PaymentState payment) {

  /** The student {@code entry} holds, without the payment fields. */
  public static Student of(StudentListEntry entry) {
    return new Student(
        entry.getId(),
        entry.getFirstName(),
        entry.getLastName(),
        entry.getEmail(),
        entry.getPhone(),
        entry.getBirthDate(),
        entry.getStartDate(),
        entry.getStatus(),
        entry.currentRank(),
        entry.getVersion(),
        null,
        null,
        null);
  }

  /**
   * The student {@code entry} holds, with its plan, paid through and payment state on {@code
   * today}.
   */
  public static Student withPayment(StudentListEntry entry, LocalDate today) {
    LocalDate paidThrough = entry.isHasMembership() ? entry.getPaidThrough() : null;
    return new Student(
        entry.getId(),
        entry.getFirstName(),
        entry.getLastName(),
        entry.getEmail(),
        entry.getPhone(),
        entry.getBirthDate(),
        entry.getStartDate(),
        entry.getStatus(),
        entry.currentRank(),
        entry.getVersion(),
        entry.getPlanName(),
        paidThrough,
        PaymentState.of(entry.getStatus(), paidThrough, today));
  }
}
