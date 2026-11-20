package org.jwcarman.roux.examples.dojo.identity;

/**
 * The dojo's permissions. Its roles grant them in {@code db/changelog/roles.xml}; adding one means
 * a constant here and a changeset there. {@code PermissionsTest} checks the two agree and writes
 * the frontend's {@code permissions.gen.ts} from these.
 */
public final class Permissions {

  public static final String RANKS_READ = "ranks.read";
  public static final String RANKS_MANAGE = "ranks.manage";
  public static final String STUDENTS_READ = "students.read";
  public static final String STUDENTS_MANAGE = "students.manage";
  public static final String PROMOTIONS_MANAGE = "promotions.manage";
  public static final String CLASSES_READ = "classes.read";
  public static final String CLASSES_MANAGE = "classes.manage";
  public static final String ATTENDANCE_RECORD = "attendance.record";
  public static final String ATTENDANCE_READ = "attendance.read";

  /** Keep the plans the school offers and their prices. */
  public static final String PLANS_MANAGE = "plans.manage";

  /** Start a student's membership and record (or remove) their payments. */
  public static final String PAYMENTS_RECORD = "payments.record";

  /** See money taken each month and this month's payments. */
  public static final String PAYMENTS_READ = "payments.read";

  private Permissions() {}
}
