package org.jwcarman.roux.examples.dojo.students;

import java.time.LocalDate;
import java.util.UUID;

import org.jwcarman.roux.examples.dojo.ranks.Rank;

/** A student as their own page shows them. */
public record StudentDetail(
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

  /** The detail of {@code entry}. */
  public static StudentDetail of(StudentListEntry entry) {
    return new StudentDetail(
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
