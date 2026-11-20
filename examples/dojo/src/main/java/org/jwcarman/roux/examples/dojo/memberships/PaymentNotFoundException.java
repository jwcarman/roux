package org.jwcarman.roux.examples.dojo.memberships;

import java.io.Serial;
import java.util.UUID;

import org.jwcarman.roux.problems.NotFoundException;

public class PaymentNotFoundException extends NotFoundException {

  @Serial private static final long serialVersionUID = 1L;

  public PaymentNotFoundException(UUID id) {
    super("No payment %s", id);
  }
}
