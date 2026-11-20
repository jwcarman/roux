/*
 * Copyright © 2026 James Carman
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.jwcarman.roux.activity;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.jspecify.annotations.Nullable;
import org.jwcarman.jpa.entity.BaseEntity;

/** One row of {@code roux_activity}: written once by {@link ActivityLog}, never updated. */
@Entity
@Table(name = "roux_activity")
@Immutable
public class ActivityEntry extends BaseEntity {

  private Instant occurredAt;
  private @Nullable UUID actorId;
  private UUID anchorId;

  @JdbcTypeCode(SqlTypes.ARRAY)
  private UUID[] relatedIds;

  private String type;
  private String description;

  @JdbcTypeCode(SqlTypes.JSON)
  private String details;

  /** For JPA. */
  protected ActivityEntry() {}

  ActivityEntry(
      Instant occurredAt,
      @Nullable UUID actorId,
      UUID anchorId,
      UUID[] relatedIds,
      String type,
      String description,
      String details) {
    this.occurredAt = occurredAt;
    this.actorId = actorId;
    this.anchorId = anchorId;
    this.relatedIds = relatedIds.clone();
    this.type = type;
    this.description = description;
    this.details = details;
  }

  /** When it happened. */
  public Instant getOccurredAt() {
    return occurredAt;
  }

  /** Who did it; {@code null} for the system. */
  public @Nullable UUID getActorId() {
    return actorId;
  }

  /** The record it is about. */
  public UUID getAnchorId() {
    return anchorId;
  }

  /** The other records it concerns. */
  public UUID[] getRelatedIds() {
    return relatedIds.clone();
  }

  /** Its kind's code. */
  public String getType() {
    return type;
  }

  /** What happened. */
  public String getDescription() {
    return description;
  }

  /** Its components, as JSON. */
  public String getDetails() {
    return details;
  }
}
