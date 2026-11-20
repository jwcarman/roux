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
package org.jwcarman.roux.autoconfigure.auditing;

import org.jwcarman.roux.jpa.IdentityAuditor;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * JPA auditing's settings.
 *
 * @param systemAuditor who {@code @CreatedBy} and {@code @LastModifiedBy} record for a change
 *     nobody signed in made ({@code roux.auditing.system-auditor}; {@value
 *     IdentityAuditor#DEFAULT_SYSTEM_AUDITOR} unless set)
 */
@ConfigurationProperties("roux.auditing")
public record RouxAuditingProperties(
    @DefaultValue(IdentityAuditor.DEFAULT_SYSTEM_AUDITOR) String systemAuditor) {

  /**
   * Refuses a blank name.
   *
   * @throws IllegalArgumentException if the system auditor is set blank
   */
  public RouxAuditingProperties {
    if (systemAuditor.isBlank()) {
      throw new IllegalArgumentException("roux.auditing.system-auditor must not be blank");
    }
  }
}
