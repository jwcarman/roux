package org.jwcarman.roux.examples.dojo.members;

import org.jwcarman.roux.roles.OwnerCreated;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Gives the owner roux makes at startup a member profile, as everyone on the team has one. roux
 * publishes {@link OwnerCreated} inside the owner's transaction, so the profile commits with it.
 */
@Component
class OwnerProfiles {

  private final MemberProfileRepository profiles;

  OwnerProfiles(MemberProfileRepository profiles) {
    this.profiles = profiles;
  }

  @EventListener
  void on(OwnerCreated owner) {
    profiles.save(new MemberProfile(owner.identityId(), owner.name(), owner.email()));
  }
}
