package org.jwcarman.roux.examples.dojo.plans;

import java.io.Serial;
import java.util.UUID;

import org.jwcarman.roux.problems.NotFoundException;

public class PlanNotFoundException extends NotFoundException {

  @Serial private static final long serialVersionUID = 1L;

  public PlanNotFoundException(UUID id) {
    super("No plan %s", id);
  }
}
