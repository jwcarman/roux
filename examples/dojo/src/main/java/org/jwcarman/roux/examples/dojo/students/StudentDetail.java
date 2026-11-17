package org.jwcarman.roux.examples.dojo.students;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import org.jwcarman.roux.examples.dojo.ranks.Rank;

/** A student as their own page shows them, with their promotions, newest first. */
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
    long version,
    List<Promotion> promotions) {

  /** The detail of {@code entry}, with its {@code promotions}. */
  public static StudentDetail of(StudentListEntry entry, List<Promotion> promotions) {
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
        entry.getVersion(),
        promotions);
  }
}
