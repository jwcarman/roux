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
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;

@DisplayNameGeneration(ReplaceUnderscores.class)
class UserDirectoryTypesTest {

  private final UUID ada = UUID.randomUUID();

  @Test
  void a_filter_without_a_status_is_for_active_users() {
    assertThat(new UserFilter("ada", "MEMBER", null))
        .isEqualTo(new UserFilter("ada", "MEMBER", UserStatus.ACTIVE));
  }

  @Test
  void the_sorts_name_the_directorys_properties() {
    assertThat(UserSort.NAME.getSortProperty()).isEqualTo("displayName");
    assertThat(UserSort.EMAIL.getSortProperty()).isEqualTo("email");
    assertThat(UserSort.ROLE.getSortProperty()).isEqualTo("role");
    assertThat(UserSort.JOINED.getSortProperty()).isEqualTo("joinedAt");
  }

  @Test
  void a_row_is_the_entrys_name_email_role_and_status() {
    UserDirectoryEntry entry = mock(UserDirectoryEntry.class);
    when(entry.getId()).thenReturn(ada);
    when(entry.getDisplayName()).thenReturn("Ada Lovelace");
    when(entry.getEmail()).thenReturn("ada@example.org");
    when(entry.getRole()).thenReturn("MEMBER");
    when(entry.getStatus()).thenReturn("ACTIVE");

    assertThat(UserRow.of(entry))
        .isEqualTo(new UserRow(ada, "Ada Lovelace", "ada@example.org", "MEMBER", "ACTIVE"));
  }

  @Test
  void jpa_makes_an_empty_entry() {
    UserDirectoryEntry entry = new UserDirectoryEntry() {};

    assertThat(entry.getDisplayName()).isNull();
    assertThat(entry.getEmail()).isNull();
    assertThat(entry.getRole()).isNull();
    assertThat(entry.getStatus()).isNull();
    assertThat(entry.getJoinedAt()).isNull();
    assertThat(entry.isInvited()).isFalse();
  }

  @Test
  void actor_names_come_from_the_app_users() {
    AppUserRepository users = mock(AppUserRepository.class);
    UUID nobody = UUID.randomUUID();
    when(users.findAllById(Set.of(ada, nobody)))
        .thenReturn(List.of(new AppUser(ada, "Ada Lovelace")));

    assertThat(new AppUserActorNames(users).namesOf(Set.of(ada, nobody)))
        .isEqualTo(Map.of(ada, "Ada Lovelace"));
  }
}
