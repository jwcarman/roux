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
package org.jwcarman.roux.users;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;

@DisplayNameGeneration(ReplaceUnderscores.class)
class UserRequestsTest {

  @Test
  void a_name_change_is_trimmed() {
    assertThat(new NameChange("  Ada King ", 2L))
        .isEqualTo(new NameChange("Ada King", 2L))
        .extracting(NameChange::displayName)
        .isEqualTo("Ada King");
  }

  @Test
  void a_missing_name_stays_missing_for_validation() {
    assertThat(new NameChange(null, 0L).displayName()).isNull();
  }

  @Test
  void an_invitation_trims_the_name_and_the_address() {
    InvitationRequest request = new InvitationRequest(" Grace ", " grace@example.org ", "MEMBER");

    assertThat(request.name()).isEqualTo("Grace");
    assertThat(request.email()).isEqualTo("grace@example.org");
    assertThat(request.role()).isEqualTo("MEMBER");
  }

  @Test
  void a_missing_name_or_address_stays_missing_for_validation() {
    InvitationRequest request = new InvitationRequest(null, null, "MEMBER");

    assertThat(request.name()).isNull();
    assertThat(request.email()).isNull();
  }

  @Test
  void a_role_change_and_a_result_carry_their_values() {
    assertThat(new RoleChange("INSTRUCTOR").role()).isEqualTo("INSTRUCTOR");
    assertThat(new InvitationResult(true).linkSent()).isTrue();
  }
}
