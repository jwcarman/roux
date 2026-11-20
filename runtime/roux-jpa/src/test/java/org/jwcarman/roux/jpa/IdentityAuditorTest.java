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
package org.jwcarman.roux.jpa;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;

import java.util.List;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

class IdentityAuditorTest {

  private final IdentityAuditor auditor =
      new IdentityAuditor(IdentityAuditor.DEFAULT_SYSTEM_AUDITOR);

  @AfterEach
  void clear() {
    SecurityContextHolder.clearContext();
  }

  @Test
  void theSignedInUserIsTheAuditor() {
    SecurityContextHolder.getContext()
        .setAuthentication(
            new TestingAuthenticationToken("01a1fa42-identity", null, "ROLE_MEMBER"));

    assertThat(auditor.getCurrentAuditor()).contains("01a1fa42-identity");
  }

  @Test
  void withNobodySignedInTheAuditorIsTheSystem() {
    assertThat(auditor.getCurrentAuditor()).contains(IdentityAuditor.DEFAULT_SYSTEM_AUDITOR);
    assertThat(IdentityAuditor.DEFAULT_SYSTEM_AUDITOR).isEqualTo("system");
  }

  @Test
  void anAnonymousVisitorIsTheSystem() {
    SecurityContextHolder.getContext()
        .setAuthentication(
            new AnonymousAuthenticationToken(
                "key", "anonymousUser", List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS"))));

    assertThat(auditor.getCurrentAuditor()).contains(IdentityAuditor.DEFAULT_SYSTEM_AUDITOR);
  }

  @Test
  void anAuthenticationNotYetAcceptedIsTheSystem() {
    SecurityContextHolder.getContext()
        .setAuthentication(new TestingAuthenticationToken("not-yet", null));

    assertThat(auditor.getCurrentAuditor()).contains(IdentityAuditor.DEFAULT_SYSTEM_AUDITOR);
  }

  @Test
  void theSystemsNameIsTheApplicationsChoice() {
    assertThat(new IdentityAuditor("scheduler").getCurrentAuditor()).contains("scheduler");
  }

  @Test
  void theSystemNeedsAName() {
    assertThatIllegalArgumentException()
        .isThrownBy(() -> new IdentityAuditor(" "))
        .withMessage("The system auditor's name must not be blank");
  }
}
