/*
 * Copyright © 2026 James Carman
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.jwcarman.roux.roles;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.jwcarman.who.emaillink.IdentityInvited;
import org.jwcarman.who.emaillink.InvalidInvitationException;

@DisplayNameGeneration(ReplaceUnderscores.class)
class InvitableRolesTest {

  private final InvitableRoles roles = new InvitableRoles(List.of("MEMBER", "INSTRUCTOR"));

  private static IdentityInvited invitation(String... roles) {
    return new IdentityInvited(
        Instant.EPOCH, UUID.randomUUID(), "x@example.com", Set.copyOf(Arrays.asList(roles)));
  }

  @Test
  void names_keep_the_configured_order() {
    assertThat(roles.names()).containsExactly("MEMBER", "INSTRUCTOR");
  }

  @Test
  void contains_only_what_is_listed() {
    assertThat(roles.contains("MEMBER")).isTrue();
    assertThat(roles.contains("OWNER")).isFalse();
  }

  @Test
  void owner_can_never_be_listed() {
    assertThatIllegalArgumentException()
        .isThrownBy(() -> new InvitableRoles(List.of("MEMBER", "OWNER")))
        .withMessage("roux.roles.invitable may not list OWNER: owners are never invited");
  }

  @Test
  void a_blank_entry_names_the_setting() {
    assertThatIllegalArgumentException()
        .isThrownBy(() -> new InvitableRoles(List.of("MEMBER", " ")))
        .withMessageContaining("roux.roles.invitable");
  }

  @Test
  void none_listed_is_an_empty_list() {
    assertThat(new InvitableRoles(null).names()).isEmpty();
  }

  @Test
  void the_controller_answers_the_names() {
    assertThat(new InvitableRolesController(roles).invitable())
        .containsExactly("MEMBER", "INSTRUCTOR");
    assertThat(InvitableRolesController.PATH).isEqualTo("/api/roles/invitable");
  }

  @Test
  void the_guard_passes_a_listed_role() {
    InvitableRolesGuard guard = new InvitableRolesGuard(roles);

    assertThatCode(() -> guard.on(invitation("MEMBER"))).doesNotThrowAnyException();
  }

  @Test
  void the_guard_passes_an_invitation_with_no_role() {
    InvitableRolesGuard guard = new InvitableRolesGuard(roles);

    assertThatCode(() -> guard.on(invitation())).doesNotThrowAnyException();
  }

  @Test
  void the_guard_refuses_an_unlisted_role() {
    InvitableRolesGuard guard = new InvitableRolesGuard(roles);

    assertThatExceptionOfType(InvalidInvitationException.class)
        .isThrownBy(() -> guard.on(invitation("COACH")))
        .withMessage("An invitation may only give [MEMBER, INSTRUCTOR]");
  }
}
