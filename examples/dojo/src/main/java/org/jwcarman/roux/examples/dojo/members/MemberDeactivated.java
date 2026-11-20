package org.jwcarman.roux.examples.dojo.members;

import org.jwcarman.roux.activity.BusinessActivity;

/** A member can no longer sign in. */
public record MemberDeactivated() implements BusinessActivity {

  @Override
  public String type() {
    return "member.deactivated";
  }

  @Override
  public String describe() {
    return "Deactivated";
  }
}
