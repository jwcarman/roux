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

import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import org.jwcarman.roux.activity.ActorNames;

/** Names the actors in the activity log after their {@link AppUser}. */
public class AppUserActorNames implements ActorNames {

  private final AppUserRepository users;

  /**
   * Creates the names.
   *
   * @param users where the names are read
   */
  public AppUserActorNames(AppUserRepository users) {
    this.users = users;
  }

  @Override
  public Map<UUID, String> namesOf(Set<UUID> identityIds) {
    return users.findAllById(identityIds).stream()
        .collect(Collectors.toMap(AppUser::getId, AppUser::getDisplayName));
  }
}
