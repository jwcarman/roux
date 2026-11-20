package org.jwcarman.roux.examples.dojo.memberships;

import java.time.LocalDate;
import java.util.UUID;

import org.jwcarman.roux.activity.BusinessActivity;
import org.jwcarman.roux.money.Money;

/** A payment recorded by mistake was removed. */
public record PaymentRemoved(
    UUID paymentId, int periods, Money amount, String each, LocalDate takenOn, PaymentMethod method)
    implements BusinessActivity {

  @Override
  public String type() {
    return "payment.removed";
  }

  @Override
  public String describe() {
    return "Payment removed: " + periods + " × " + each;
  }
}
