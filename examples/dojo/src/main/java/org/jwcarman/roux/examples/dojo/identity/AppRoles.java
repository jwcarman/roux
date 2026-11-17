package org.jwcarman.roux.examples.dojo.identity;

import java.util.List;

/** The app's role names and the permissions they carry. */
public final class AppRoles {

  public static final String MEMBERS_INVITE = "members.invite";
  public static final String MEMBERS_READ = "members.read";
  public static final String MEMBERS_PROFILE = "members.profile";
  public static final String MEMBERS_MANAGE = "members.manage";
  public static final String THEME_MANAGE = "theme.manage";
  public static final String RANKS_READ = "ranks.read";
  public static final String RANKS_MANAGE = "ranks.manage";
  public static final String STUDENTS_READ = "students.read";
  public static final String STUDENTS_MANAGE = "students.manage";
  public static final String PROMOTIONS_MANAGE = "promotions.manage";
  public static final String CLASSES_READ = "classes.read";
  public static final String CLASSES_MANAGE = "classes.manage";
  public static final String ATTENDANCE_RECORD = "attendance.record";
  public static final String ATTENDANCE_READ = "attendance.read";

  private AppRoles() {}

  public enum AppRole {
    OWNER(
        MEMBERS_INVITE,
        MEMBERS_READ,
        MEMBERS_PROFILE,
        MEMBERS_MANAGE,
        THEME_MANAGE,
        RANKS_READ,
        RANKS_MANAGE,
        STUDENTS_READ,
        STUDENTS_MANAGE,
        PROMOTIONS_MANAGE,
        CLASSES_READ,
        CLASSES_MANAGE,
        ATTENDANCE_RECORD,
        ATTENDANCE_READ),
    INSTRUCTOR(
        RANKS_READ,
        STUDENTS_READ,
        STUDENTS_MANAGE,
        PROMOTIONS_MANAGE,
        MEMBERS_READ,
        MEMBERS_PROFILE,
        CLASSES_READ,
        ATTENDANCE_RECORD,
        ATTENDANCE_READ),
    MEMBER(MEMBERS_READ, MEMBERS_PROFILE, RANKS_READ, STUDENTS_READ, CLASSES_READ, ATTENDANCE_READ);

    private final List<String> permissions;

    AppRole(String... permissions) {
      this.permissions = List.of(permissions);
    }

    public List<String> permissions() {
      return permissions;
    }
  }
}
