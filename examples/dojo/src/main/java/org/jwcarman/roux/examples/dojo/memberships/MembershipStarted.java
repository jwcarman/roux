package org.jwcarman.roux.examples.dojo.memberships;

import java.time.LocalDate;
import java.util.UUID;

import org.jwcarman.roux.activity.BusinessActivity;

/** A student's membership on a plan started. */
public record MembershipStarted(UUID planId, String plan, LocalDate startDate)
    implements BusinessActivity {

  @Override
  public String type() {
    return "membership.started";
  }

  @Override
  public String describe() {
    return "Membership started: " + plan;
  }
}
