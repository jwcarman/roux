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
    long version) {

  /** The student {@code entry} holds. */
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
        entry.getVersion());
  }
}
