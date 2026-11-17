package org.jwcarman.roux.examples.dojo.students;

import java.io.Serial;
import java.util.UUID;

import org.jwcarman.roux.problems.NotFoundException;

/** The student has no promotion with the id asked for. */
public class PromotionNotFoundException extends NotFoundException {

  @Serial private static final long serialVersionUID = 1L;

  public PromotionNotFoundException(UUID id) {
    super("No promotion %s", id);
  }
}
