package org.jwcarman.roux.examples.dojo.activity;

import java.time.Instant;
import java.util.UUID;

/** An activity entry joined to its actor's display name, if the actor still has a profile. */
public record ActivityView(
    UUID id,
    Instant occurredAt,
    String action,
    String summary,
    UUID actorId,
    String actorDisplayName) {}
