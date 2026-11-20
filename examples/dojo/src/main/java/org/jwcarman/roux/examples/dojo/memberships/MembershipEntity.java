package org.jwcarman.roux.examples.dojo.memberships;

import java.time.LocalDate;
import java.util.UUID;

import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import org.jwcarman.jpa.spring.audit.AuditableEntity;
import org.jwcarman.roux.examples.dojo.plans.PlanEntity;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * A student on a plan from a start date; current until another starts (then {@code endDate} is
 * set).
 */
@Entity
@Table(name = "membership")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class MembershipEntity extends AuditableEntity {

  private UUID studentId;

  @ManyToOne(fetch = FetchType.LAZY, optional = false)
  @JoinColumn(name = "plan_id")
  private PlanEntity plan;

  private LocalDate startDate;

  private LocalDate endDate;

  public MembershipEntity(UUID studentId, PlanEntity plan, LocalDate startDate) {
    this.studentId = studentId;
    this.plan = plan;
    this.startDate = startDate;
  }

  /** Ends this membership on {@code lastDay}, the day before the next one starts. */
  public void end(LocalDate lastDay) {
    this.endDate = lastDay;
  }
}
