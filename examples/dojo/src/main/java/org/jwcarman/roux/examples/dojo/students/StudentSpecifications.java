package org.jwcarman.roux.examples.dojo.students;

import java.util.UUID;

import org.springframework.data.jpa.domain.Specification;

/** Filters on the student list, to combine with its search. */
final class StudentSpecifications {

  private StudentSpecifications() {}

  static Specification<StudentListEntry> statusIs(StudentStatus status) {
    return (entry, query, cb) -> cb.equal(entry.get("status"), status);
  }

  static Specification<StudentListEntry> currentRankIs(UUID rankId) {
    return (entry, query, cb) -> cb.equal(entry.get("rankId"), rankId);
  }
}
