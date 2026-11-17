package org.jwcarman.roux.examples.dojo.members;

import org.jwcarman.roux.examples.dojo.identity.AppRoles.AppRole;

/** The roles an invitation can give. An owner is never invited: owners are made at startup. */
public enum InvitableRole {
  MEMBER(AppRole.MEMBER),
  INSTRUCTOR(AppRole.INSTRUCTOR);

  private final AppRole role;

  InvitableRole(AppRole role) {
    this.role = role;
  }

  /** The app role the invited member is given. */
  public AppRole role() {
    return role;
  }
}
