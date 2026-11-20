package org.jwcarman.roux.examples.dojo.members;

import org.jwcarman.roux.roles.UserJoined;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Gives every member who joins a profile: the owner roux makes at startup, everyone invited, and a
 * test's people. roux publishes {@link UserJoined} inside the transaction that creates the member,
 * so the profile commits with it.
 */
@Component
class MemberProfiles {

  private final MemberProfileRepository profiles;

  MemberProfiles(MemberProfileRepository profiles) {
    this.profiles = profiles;
  }

  @EventListener
  void on(UserJoined member) {
    profiles.save(new MemberProfile(member.identityId(), member.name(), member.email()));
  }
}
