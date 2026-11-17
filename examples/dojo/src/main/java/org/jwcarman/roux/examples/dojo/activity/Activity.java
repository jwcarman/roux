package org.jwcarman.roux.examples.dojo.activity;

import java.time.Instant;
import java.util.UUID;

/**
 * A line of history as the API shows it.
 *
 * @param actorName who made the change: their current display name, "System" for the app itself, or
 *     "A former member" when that identity no longer exists
 */
public record Activity(
    UUID id, Instant occurredAt, String action, String summary, String actorName) {

  static final String SYSTEM = "System";
  static final String FORMER_MEMBER = "A former member";

  static Activity of(ActivityView view) {
    String actorName;
    if (view.actorId() == null) {
      actorName = SYSTEM;
    } else if (view.actorDisplayName() == null) {
      actorName = FORMER_MEMBER;
    } else {
      actorName = view.actorDisplayName();
    }
    return new Activity(view.id(), view.occurredAt(), view.action(), view.summary(), actorName);
  }
}
