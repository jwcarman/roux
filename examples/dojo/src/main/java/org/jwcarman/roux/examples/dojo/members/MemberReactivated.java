package org.jwcarman.roux.examples.dojo.members;

import org.jwcarman.roux.activity.BusinessActivity;

/** A deactivated member can sign in again. */
public record MemberReactivated() implements BusinessActivity {

  @Override
  public String type() {
    return "member.reactivated";
  }

  @Override
  public String describe() {
    return "Reactivated";
  }
}
