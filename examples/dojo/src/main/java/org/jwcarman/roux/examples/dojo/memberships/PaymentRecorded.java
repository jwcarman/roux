package org.jwcarman.roux.examples.dojo.memberships;

import java.time.LocalDate;
import java.util.UUID;

import org.jwcarman.roux.activity.BusinessActivity;
import org.jwcarman.roux.money.Money;

/** A payment was taken: {@code periods} at {@code each} (the price as the school writes it). */
public record PaymentRecorded(
    UUID paymentId, int periods, Money amount, String each, LocalDate takenOn, PaymentMethod method)
    implements BusinessActivity {

  @Override
  public String type() {
    return "payment.recorded";
  }

  @Override
  public String describe() {
    return "Payment recorded: " + periods + " × " + each;
  }
}
