package org.jwcarman.roux.examples.dojo.students;

import java.io.Serial;
import java.util.UUID;

import org.jwcarman.roux.problems.NotFoundException;

/** No student has the id asked for. */
public class StudentNotFoundException extends NotFoundException {

  @Serial private static final long serialVersionUID = 1L;

  public StudentNotFoundException(UUID id) {
    super("No student %s", id);
  }
}
