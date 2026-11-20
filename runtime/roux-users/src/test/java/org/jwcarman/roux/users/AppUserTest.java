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
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import java.util.UUID;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

@DisplayNameGeneration(ReplaceUnderscores.class)
class AppUserTest {

  private final UUID id = UUID.randomUUID();

  @Nested
  class A_new_user {

    @Test
    void has_the_identitys_id_and_a_trimmed_name() {
      AppUser ada = new AppUser(id, "  Ada Lovelace ");

      assertThat(ada.getId()).isEqualTo(id);
      assertThat(ada.getDisplayName()).isEqualTo("Ada Lovelace");
    }

    @Test
    void needs_a_name() {
      assertThatIllegalArgumentException().isThrownBy(() -> new AppUser(id, "  "));
    }
  }

  @Test
  void jpa_makes_one_with_no_name_yet() {
    assertThat(new AppUser() {}.getDisplayName()).isNull();
  }

  @Nested
  class Renaming {

    private final AppUser ada = new AppUser(id, "Ada Lovelace");

    @Test
    void trims_the_new_name() {
      ada.rename(" Ada King ");

      assertThat(ada.getDisplayName()).isEqualTo("Ada King");
    }

    @Test
    void takes_a_name_of_the_longest_length() {
      ada.rename("x".repeat(AppUser.MAX_NAME));

      assertThat(ada.getDisplayName()).hasSize(80);
    }

    @Test
    void refuses_a_blank_name() {
      assertThatIllegalArgumentException()
          .isThrownBy(() -> ada.rename(" "))
          .withMessage("A user's name must not be blank");
    }

    @Test
    void refuses_a_null_name() {
      assertThatIllegalArgumentException().isThrownBy(() -> ada.rename(null));
    }

    @Test
    void refuses_a_name_too_long() {
      assertThatIllegalArgumentException()
          .isThrownBy(() -> ada.rename("x".repeat(81)))
          .withMessage("A user's name must be at most 80 characters");
    }

    @Test
    void measures_the_name_after_trimming() {
      ada.rename(" " + "x".repeat(80) + " ");

      assertThat(ada.getDisplayName()).hasSize(80);
    }
  }
}
