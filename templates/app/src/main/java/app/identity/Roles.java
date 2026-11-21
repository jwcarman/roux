package app.identity;

/**
 * The app's own roles, which {@code db/changelog/roles.xml} creates. The owner's role is roux's
 * ({@code RouxRoles.OWNER}).
 */
public final class Roles {

  /**
   * Anyone invited to the app. It grants seeing the team ({@code users.read}) and nothing else yet.
   */
  public static final String USER = "USER";

  private Roles() {}
}
