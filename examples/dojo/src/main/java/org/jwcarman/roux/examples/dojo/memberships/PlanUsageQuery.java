package org.jwcarman.roux.examples.dojo.memberships;

import java.util.UUID;

import org.jwcarman.roux.examples.dojo.plans.PlanUsage;
import org.springframework.stereotype.Component;

/** A plan is in use once any membership, current or ended, has been on it. */
@Component
class PlanUsageQuery implements PlanUsage {

  private final MembershipRepository memberships;

  PlanUsageQuery(MembershipRepository memberships) {
    this.memberships = memberships;
  }

  @Override
  public boolean isInUse(UUID planId) {
    return memberships.existsByPlanId(planId);
  }
}
