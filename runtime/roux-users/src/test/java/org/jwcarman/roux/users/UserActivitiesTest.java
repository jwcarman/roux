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
class UserActivitiesTest {

  @Test
  void invited() {
    UserInvited activity = new UserInvited("Grace Hopper");

    assertThat(activity.type()).isEqualTo("user.invited");
    assertThat(activity.describe()).isEqualTo("Invited Grace Hopper");
  }

  @Test
  void renamed() {
    UserRenamed activity = new UserRenamed("Ada Lovelace", "Ada King");

    assertThat(activity.type()).isEqualTo("user.renamed");
    assertThat(activity.describe()).isEqualTo("Renamed from Ada Lovelace to Ada King");
  }

  @Test
  void deactivated() {
    UserDeactivated activity = new UserDeactivated();

    assertThat(activity.type()).isEqualTo("user.deactivated");
    assertThat(activity.describe()).isEqualTo("Deactivated");
  }

  @Test
  void reactivated() {
    UserReactivated activity = new UserReactivated();

    assertThat(activity.type()).isEqualTo("user.reactivated");
    assertThat(activity.describe()).isEqualTo("Reactivated");
  }

  @Test
  void role_changed() {
    UserRoleChanged activity = new UserRoleChanged("MEMBER", "INSTRUCTOR");

    assertThat(activity.type()).isEqualTo("user.role_changed");
    assertThat(activity.describe()).isEqualTo("Role changed from MEMBER to INSTRUCTOR");
  }
}
