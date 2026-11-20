package org.jwcarman.roux.examples.dojo.identity;

/**
 * The dojo's own roles, which {@code db/changelog/roles.xml} creates. The owner's role is roux's
 * ({@code RouxRoles.OWNER}).
 */
public final class Roles {

  public static final String INSTRUCTOR = "INSTRUCTOR";
  public static final String MEMBER = "MEMBER";

  private Roles() {}
}
