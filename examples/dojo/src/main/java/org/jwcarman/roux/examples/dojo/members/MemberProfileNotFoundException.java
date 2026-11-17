package org.jwcarman.roux.examples.dojo.members;

import java.io.Serial;

import org.jwcarman.roux.problems.NotFoundException;

/**
 * A team member has no profile. Every path that creates a team member creates the row, so this
 * signals a bug, not a flow.
 */
public class MemberProfileNotFoundException extends NotFoundException {

  @Serial private static final long serialVersionUID = 1L;

  public MemberProfileNotFoundException() {
    super("No profile for the signed-in member");
  }
}
