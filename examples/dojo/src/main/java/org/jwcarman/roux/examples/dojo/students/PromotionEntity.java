package org.jwcarman.roux.examples.dojo.students;

import java.time.LocalDate;
import java.util.UUID;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import org.jwcarman.jpa.spring.audit.AuditableEntity;
import org.jwcarman.roux.examples.dojo.ranks.RankEntity;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * A student's promotion to a rank on a date. A student's current rank is that of their latest
 * promotion by date, and of the latest created when two share a date.
 */
@Entity
@Table(name = "promotion")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PromotionEntity extends AuditableEntity {

  private UUID studentId;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "rank_id")
  private RankEntity rank;

  private LocalDate promotedOn;

  /** Promotes the student {@code studentId} to {@code rank} on {@code promotedOn}. */
  public PromotionEntity(UUID studentId, RankEntity rank, LocalDate promotedOn) {
    this.studentId = studentId;
    this.rank = rank;
    this.promotedOn = promotedOn;
  }
}
