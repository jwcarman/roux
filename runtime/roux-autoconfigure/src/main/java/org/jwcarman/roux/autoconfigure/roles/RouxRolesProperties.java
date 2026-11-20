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
package org.jwcarman.roux.autoconfigure.roles;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * roux's role settings.
 *
 * @param invitable the roles an invitation may give, in the order the invite form offers them;
 *     empty by default, and never {@code OWNER}
 */
@ConfigurationProperties("roux.roles")
public record RouxRolesProperties(List<String> invitable) {

  /** Defaults {@code invitable} to an empty list. */
  public RouxRolesProperties {
    invitable = invitable == null ? List.of() : List.copyOf(invitable);
  }
}
