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

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The first owner, whom roux makes at startup while no active identity holds {@code OWNER}. Once an
 * active owner exists, these change nothing: owners are managed in the app, not by restarting it.
 *
 * @param email the first owner's address (required)
 * @param name the first owner's display name (required; stripped)
 */
@ConfigurationProperties("roux.owner")
public record RouxOwnerProperties(String email, String name) {

  /**
   * Checks both settings are set.
   *
   * @throws IllegalArgumentException naming the setting that is missing or blank
   */
  public RouxOwnerProperties {
    if (email == null || email.isBlank()) {
      throw new IllegalArgumentException(
          "roux.owner.email must be set to the first owner's address");
    }
    if (name == null || name.isBlank()) {
      throw new IllegalArgumentException("roux.owner.name must be set to the first owner's name");
    }
    name = name.strip();
  }
}
