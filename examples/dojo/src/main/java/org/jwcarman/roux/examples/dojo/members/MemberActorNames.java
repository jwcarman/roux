package org.jwcarman.roux.examples.dojo.members;

import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.jwcarman.roux.activity.ActorNames;
import org.springframework.stereotype.Component;

/** Who did what: a member's display name from their profile (whose id is their identity's). */
@Component
public class MemberActorNames implements ActorNames {

  private final MemberProfileRepository profiles;

  public MemberActorNames(MemberProfileRepository profiles) {
    this.profiles = profiles;
  }

  @Override
  public Map<UUID, String> namesOf(Set<UUID> identityIds) {
    return profiles.findAllById(identityIds).stream()
        .collect(Collectors.toMap(MemberProfile::getId, MemberProfile::getDisplayName));
  }
}
