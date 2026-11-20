package org.jwcarman.roux.examples.dojo.students;

import java.time.LocalDate;
import java.util.UUID;

import jakarta.persistence.criteria.Predicate;

import org.springframework.data.jpa.domain.Specification;

/** Filters on the student list, to combine with its search. */
final class StudentSpecifications {

  private StudentSpecifications() {}

  static Specification<StudentListEntry> statusIs(StudentStatus status) {
    return (entry, query, cb) -> cb.equal(entry.get("status"), status);
  }

  /** Students in {@code state} on {@code today} (see {@link PaymentState#of}). */
  static Specification<StudentListEntry> paymentIs(PaymentState state, LocalDate today) {
    return (entry, query, cb) -> {
      Predicate has = cb.isTrue(entry.get("hasMembership"));
      Predicate overdue =
          cb.and(
              has,
              cb.equal(entry.get("status"), StudentStatus.ACTIVE),
              cb.lessThan(entry.<LocalDate>get("paidThrough"), today));
      return switch (state) {
        case NONE -> cb.not(has);
        case OVERDUE -> overdue;
        case PAID -> cb.and(has, cb.not(overdue));
      };
    };
  }

  static Specification<StudentListEntry> currentRankIs(UUID rankId) {
    return (entry, query, cb) -> cb.equal(entry.get("rankId"), rankId);
  }
}
