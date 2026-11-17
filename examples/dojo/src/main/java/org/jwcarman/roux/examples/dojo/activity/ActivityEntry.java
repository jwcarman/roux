package org.jwcarman.roux.examples.dojo.activity;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import org.hibernate.annotations.Immutable;
import org.jwcarman.jpa.entity.BaseEntity;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** One line of the activity log: what changed, who changed it and when. Never updated. */
@Entity
@Table(name = "activity")
@Immutable
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ActivityEntry extends BaseEntity {

  private Instant occurredAt;
  private UUID actorId;
  private String subjectType;
  private UUID subjectId;
  private String action;
  private String summary;

  ActivityEntry(
      Instant occurredAt,
      UUID actorId,
      String subjectType,
      UUID subjectId,
      String action,
      String summary) {
    this.occurredAt = occurredAt;
    this.actorId = actorId;
    this.subjectType = subjectType;
    this.subjectId = subjectId;
    this.action = action;
    this.summary = summary;
  }
}
