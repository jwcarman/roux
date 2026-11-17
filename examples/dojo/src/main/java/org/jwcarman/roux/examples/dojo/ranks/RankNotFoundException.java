package org.jwcarman.roux.examples.dojo.ranks;

import java.io.Serial;
import java.util.UUID;

import org.jwcarman.roux.problems.NotFoundException;

/** No rank has the id asked for. */
public class RankNotFoundException extends NotFoundException {

  @Serial private static final long serialVersionUID = 1L;

  public RankNotFoundException(UUID id) {
    super("No rank %s", id);
  }
}
