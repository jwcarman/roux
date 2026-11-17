package org.jwcarman.roux.examples.dojo.members;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;

import org.junit.jupiter.api.Test;

class MemberProfileTest {

  private static final UUID IDENTITY = UUID.randomUUID();

  @Test
  void constructorStripsName() {
    MemberProfile profile = new MemberProfile(IDENTITY, " Ada ", "ada@example.com");

    assertThat(profile.getDisplayName()).isEqualTo("Ada");
    assertThat(profile.getEmail()).isEqualTo("ada@example.com");
  }

  @Test
  void theProfilesIdIsTheIdentitys() {
    assertThat(new MemberProfile(IDENTITY, "Ada", "ada@example.com").getId()).isEqualTo(IDENTITY);
  }

  @Test
  void blankNameIsRejected() {
    assertThatThrownBy(() -> new MemberProfile(IDENTITY, "  ", "ada@example.com"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new MemberProfile(IDENTITY, null, "ada@example.com"))
        .isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void nameOver80IsRejected() {
    assertThatThrownBy(() -> new MemberProfile(IDENTITY, "a".repeat(81), "ada@example.com"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThat(new MemberProfile(IDENTITY, "a".repeat(80), "ada@example.com").getDisplayName())
        .hasSize(80);
  }

  @Test
  void renameAppliesTheSameRule() {
    MemberProfile profile = new MemberProfile(IDENTITY, "Ada", "ada@example.com");

    profile.rename(" Ada King ");
    assertThat(profile.getDisplayName()).isEqualTo("Ada King");

    assertThatThrownBy(() -> profile.rename(" ")).isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> profile.rename("a".repeat(81)))
        .isInstanceOf(IllegalArgumentException.class);
    assertThat(profile.getDisplayName()).isEqualTo("Ada King");
  }
}
