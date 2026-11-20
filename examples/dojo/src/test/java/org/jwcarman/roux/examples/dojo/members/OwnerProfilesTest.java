package org.jwcarman.roux.examples.dojo.members;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.test.AppTest;
import org.jwcarman.roux.test.TestUsers;
import org.springframework.beans.factory.annotation.Autowired;

/** The owner roux makes at startup gets a member profile, as everyone on the team has one. */
@AppTest
class OwnerProfilesTest {

  @Autowired TestUsers users;
  @Autowired MemberProfileRepository profiles;

  @BeforeEach
  void reset() {
    users.reset();
  }

  @Test
  void theOwnerHasAProfile() {
    MemberProfile profile = profiles.findById(users.owner().id()).orElseThrow();

    assertThat(profile.getDisplayName()).isEqualTo("Test Owner");
    assertThat(profile.getEmail()).isEqualTo(TestUsers.OWNER_EMAIL);
  }
}
