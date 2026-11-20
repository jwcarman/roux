package org.jwcarman.roux.examples.dojo.memberships;

import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.jwcarman.roux.activity.ActorNames;
import org.springframework.stereotype.Component;

/** Who recorded a payment, by name, from its auditing {@code createdBy} (an identity id). */
@Component
class Recorders {

  static final String UNKNOWN = "Unknown";

  private final ActorNames names;

  Recorders(ActorNames names) {
    this.names = names;
  }

  /** The member's display name, or {@value #UNKNOWN} without a profile (or for "system"). */
  String nameOf(String createdBy) {
    return parse(createdBy)
        .map(id -> names.namesOf(Set.of(id)).getOrDefault(id, UNKNOWN))
        .orElse(UNKNOWN);
  }

  private static Optional<UUID> parse(String id) {
    try {
      return Optional.ofNullable(id).map(UUID::fromString);
    } catch (IllegalArgumentException e) {
      return Optional.empty();
    }
  }
}
