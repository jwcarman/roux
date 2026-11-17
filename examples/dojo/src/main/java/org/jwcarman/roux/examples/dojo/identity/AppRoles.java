package org.jwcarman.roux.examples.dojo.identity;

import java.util.List;

/** The app's role names and the permissions they carry. */
public final class AppRoles {

  public static final String MEMBERS_INVITE = "members.invite";
  public static final String MEMBERS_READ = "members.read";
  public static final String MEMBERS_PROFILE = "members.profile";
  public static final String MEMBERS_MANAGE = "members.manage";
  public static final String THEME_MANAGE = "theme.manage";

  private AppRoles() {}

  public enum AppRole {
    OWNER(MEMBERS_INVITE, MEMBERS_READ, MEMBERS_PROFILE, MEMBERS_MANAGE, THEME_MANAGE),
    MEMBER(MEMBERS_READ, MEMBERS_PROFILE);

    private final List<String> permissions;

    AppRole(String... permissions) {
      this.permissions = List.of(permissions);
    }

    public List<String> permissions() {
      return permissions;
    }
  }
}
