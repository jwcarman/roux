package org.jwcarman.roux.examples.dojo.members;

import org.jwcarman.roux.examples.dojo.identity.Roles;

/** The roles an invitation can give. An owner is never invited: owners are made at startup. */
public enum InvitableRole {
  MEMBER(Roles.MEMBER),
  INSTRUCTOR(Roles.INSTRUCTOR);

  private final String role;

  InvitableRole(String role) {
    this.role = role;
  }

  /** The app role the invited member is given. */
  public String role() {
    return role;
  }
}
