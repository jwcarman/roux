package org.jwcarman.roux.examples.dojo.members;

/** The activity log's names for members and what happens to them (see ActivityLog). */
public final class MemberActivity {

  /** The subject type of a member's activity entries; the subject id is the member's id. */
  public static final String SUBJECT = "member";

  public static final String INVITED = "member.invited";
  public static final String RENAMED = "member.renamed";
  public static final String DEACTIVATED = "member.deactivated";
  public static final String REACTIVATED = "member.reactivated";

  private MemberActivity() {}
}
