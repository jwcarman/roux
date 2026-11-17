package org.jwcarman.roux.examples.dojo.classes;

import java.io.Serial;
import java.util.UUID;

import org.jwcarman.roux.problems.NotFoundException;

/** No class has the id asked for. */
public class ClassNotFoundException extends NotFoundException {

  @Serial private static final long serialVersionUID = 1L;

  public ClassNotFoundException(UUID id) {
    super("No class %s", id);
  }
}
