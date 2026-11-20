package org.jwcarman.roux.examples.dojo.members;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.test.AppTest;
import org.jwcarman.roux.test.TestMembers;
import org.springframework.beans.factory.annotation.Autowired;

/** The owner roux makes at startup gets a member profile, as everyone on the team has one. */
@AppTest
class OwnerProfilesTest {

  @Autowired TestMembers members;
  @Autowired MemberProfileRepository profiles;

  @BeforeEach
  void reset() {
    members.reset();
  }

  @Test
  void theOwnerHasAProfile() {
    MemberProfile profile = profiles.findById(members.owner().id()).orElseThrow();

    assertThat(profile.getDisplayName()).isEqualTo("Test Owner");
    assertThat(profile.getEmail()).isEqualTo(TestMembers.OWNER_EMAIL);
  }
}
