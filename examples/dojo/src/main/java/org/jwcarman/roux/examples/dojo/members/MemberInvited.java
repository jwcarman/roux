package org.jwcarman.roux.examples.dojo.members;

import org.jwcarman.roux.activity.BusinessActivity;

/** A member was invited, under {@code name}. */
public record MemberInvited(String name) implements BusinessActivity {

  @Override
  public String type() {
    return "member.invited";
  }

  @Override
  public String describe() {
    return "Invited " + name;
  }
}
