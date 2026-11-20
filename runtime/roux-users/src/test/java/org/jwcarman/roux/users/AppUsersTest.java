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
import static org.mockito.Mockito.verify;

import java.util.UUID;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.roles.UserJoined;
import org.mockito.ArgumentCaptor;

@DisplayNameGeneration(ReplaceUnderscores.class)
class AppUsersTest {

  @Test
  void a_user_who_joins_gets_an_app_user_with_their_name() {
    AppUserRepository users = mock(AppUserRepository.class);
    UUID id = UUID.randomUUID();

    new AppUsers(users).on(new UserJoined(id, "Ada Lovelace", "ada@example.org", "MEMBER"));

    ArgumentCaptor<AppUser> saved = ArgumentCaptor.forClass(AppUser.class);
    verify(users).save(saved.capture());
    assertThat(saved.getValue().getId()).isEqualTo(id);
    assertThat(saved.getValue().getDisplayName()).isEqualTo("Ada Lovelace");
  }
}
