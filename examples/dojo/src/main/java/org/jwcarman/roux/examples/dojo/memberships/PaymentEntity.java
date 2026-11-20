package org.jwcarman.roux.examples.dojo.memberships;

import java.time.LocalDate;
import java.util.UUID;

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

/**
 * A payment taken at the desk for some periods of a membership. Its amount is the plan's price at
 * the time, kept, so a later price change rewrites no history. Who recorded it is its {@code
 * createdBy}.
 */
@Entity
@Table(name = "payment")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class PaymentEntity extends AuditableEntity {

  public static final int MAX_NOTE = 200;

  private UUID membershipId;

  private int periods;

  @Embedded
  @AttributeOverride(name = "minorUnits", column = @Column(name = "amount_minor_units"))
  @AttributeOverride(name = "currency", column = @Column(name = "amount_currency"))
  private Money amount;

  private LocalDate takenOn;

  @Enumerated(EnumType.STRING)
  private PaymentMethod method;

  private String note;

  public PaymentEntity(
      UUID membershipId,
      int periods,
      Money amount,
      LocalDate takenOn,
      PaymentMethod method,
      String note) {
    this.membershipId = membershipId;
    this.periods = periods;
    this.amount = amount;
    this.takenOn = takenOn;
    this.method = method;
    this.note = note;
  }
}
