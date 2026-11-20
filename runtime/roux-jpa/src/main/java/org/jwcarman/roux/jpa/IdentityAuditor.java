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

import java.util.Optional;

import org.springframework.data.domain.AuditorAware;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * Who JPA auditing records in {@code @CreatedBy} and {@code @LastModifiedBy}: the signed-in user's
 * name, which with who is the identity's id, or the system's name when nobody is signed in (work at
 * startup, a scheduled job, an anonymous visitor): {@value #DEFAULT_SYSTEM_AUDITOR} unless the
 * application sets {@code roux.auditing.system-auditor}. roux registers it; an application writes a
 * plain {@code @EnableJpaAuditing} and no {@code auditorAwareRef}.
 */
public class IdentityAuditor implements AuditorAware<String> {

  /** The auditor of a change nobody signed in made, unless the application names another. */
  public static final String DEFAULT_SYSTEM_AUDITOR = "system";

  private final String systemAuditor;

  /**
   * Records {@code systemAuditor} for a change nobody signed in made.
   *
   * @param systemAuditor the system's name ({@link #DEFAULT_SYSTEM_AUDITOR} by default)
   * @throws IllegalArgumentException if it is blank
   */
  public IdentityAuditor(String systemAuditor) {
    if (systemAuditor.isBlank()) {
      throw new IllegalArgumentException("The system auditor's name must not be blank");
    }
    this.systemAuditor = systemAuditor;
  }

  @Override
  public Optional<String> getCurrentAuditor() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    if (authentication == null
        || !authentication.isAuthenticated()
        || authentication instanceof AnonymousAuthenticationToken) {
      return Optional.of(systemAuditor);
    }
    return Optional.of(authentication.getName());
  }
}
