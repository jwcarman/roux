package org.jwcarman.roux.examples.dojo.members;

import org.springframework.data.jpa.domain.Specification;

/** Filters on the team directory, to combine with its search. */
final class MemberDirectorySpecifications {

  private MemberDirectorySpecifications() {}

  static Specification<MemberDirectoryEntry> roleIs(String role) {
    return (entry, query, cb) -> cb.equal(entry.get("role"), role);
  }

  static Specification<MemberDirectoryEntry> statusIs(MemberStatus status) {
    return (entry, query, cb) -> cb.equal(entry.get("status"), status.name());
  }
}
