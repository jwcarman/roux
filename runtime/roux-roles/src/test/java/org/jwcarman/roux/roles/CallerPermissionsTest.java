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
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Set;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.jwcarman.who.core.domain.Identity;
import org.jwcarman.who.core.domain.WhoPrincipal;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

@DisplayNameGeneration(ReplaceUnderscores.class)
class CallerPermissionsTest {

  private final CallerPermissions caller = new CallerPermissions();

  private static void signedInWith(String... permissions) {
    SecurityContextHolder.getContext()
        .setAuthentication(
            new TestingAuthenticationToken(
                new WhoPrincipal(Identity.create(), Set.of(permissions)), null));
  }

  @AfterEach
  void signOut() {
    SecurityContextHolder.clearContext();
  }

  @Test
  void a_caller_has_the_permissions_they_hold() {
    signedInWith("payments.record");
    assertThat(caller.has("payments.record")).isTrue();
    assertThat(caller.has("plans.manage")).isFalse();
  }

  @Test
  void no_one_signed_in_holds_nothing() {
    assertThat(caller.has("payments.record")).isFalse();
  }

  @Test
  void a_principal_that_is_not_whos_holds_nothing() {
    SecurityContextHolder.getContext()
        .setAuthentication(new TestingAuthenticationToken("someone", null, "payments.record"));
    assertThat(caller.has("payments.record")).isFalse();
  }

  @Test
  void require_passes_for_a_held_permission() {
    signedInWith("payments.record");
    assertThatCode(() -> caller.require("payments.record", "Filtering by payment"))
        .doesNotThrowAnyException();
  }

  @Test
  void require_refuses_a_missing_one_saying_what_needed_it() {
    signedInWith("students.read");
    assertThatThrownBy(() -> caller.require("payments.record", "Filtering by payment"))
        .isInstanceOf(AccessDeniedException.class)
        .hasMessage("Filtering by payment needs payments.record");
  }
}
