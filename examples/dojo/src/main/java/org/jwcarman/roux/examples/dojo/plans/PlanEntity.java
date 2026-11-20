package org.jwcarman.roux.examples.dojo.plans;

import jakarta.persistence.AttributeOverride;
import jakarta.persistence.Column;
import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;

import org.jwcarman.jpa.spring.audit.AuditableEntity;
import org.jwcarman.roux.money.Money;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** A plan the school offers: a name, a price per period, and whether it is offered now. */
@Entity
@Table(name = "plan")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PlanEntity extends AuditableEntity {

  public static final int MAX_NAME = 60;

  private String name;

  @Embedded
  @AttributeOverride(name = "minorUnits", column = @Column(name = "price_minor_units"))
  @AttributeOverride(name = "currency", column = @Column(name = "price_currency"))
  private Money price;

  @Enumerated(EnumType.STRING)
  private PlanPeriod period;

  private boolean active;

  public PlanEntity(String name, Money price, PlanPeriod period, boolean active) {
    this.name = name.strip();
    this.price = price;
    this.period = period;
    this.active = active;
  }

  public void change(String name, Money price, PlanPeriod period, boolean active) {
    this.name = name.strip();
    this.price = price;
    this.period = period;
    this.active = active;
  }
}
