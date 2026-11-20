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

import java.util.List;

/**
 * The roles an invitation may give, from {@code roux.roles.invitable}, in the order configured: the
 * invite form offers them in that order. {@link RouxRoles#OWNER} is never one: owners are made at
 * startup, never invited.
 *
 * @param names the roles' names, in the order configured; null for none
 */
public record InvitableRoles(List<String> names) {

  /**
   * Checks the list.
   *
   * @throws IllegalArgumentException when an entry is blank or names {@link RouxRoles#OWNER}
   */
  public InvitableRoles {
    List<String> listed = names == null ? List.of() : List.copyOf(names);
    for (String name : listed) {
      if (name.isBlank()) {
        throw new IllegalArgumentException("roux.roles.invitable has a blank entry");
      }
      if (RouxRoles.OWNER.equals(name)) {
        throw new IllegalArgumentException(
            "roux.roles.invitable may not list OWNER: owners are never invited");
      }
    }
    names = listed;
  }

  /**
   * Whether an invitation may give the role.
   *
   * @param role a role's name
   * @return whether it is listed
   */
  public boolean contains(String role) {
    return names.contains(role);
  }
}
