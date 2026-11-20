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

import java.time.Instant;
import java.util.UUID;

/**
 * One user, for their page.
 *
 * @param id their identity's id
 * @param displayName the name the app shows
 * @param email their oldest sign-in address
 * @param role their role's name
 * @param status a {@link UserStatus} name
 * @param joinedAt when they joined
 * @param invited whether they have never signed in, so their invitation can be sent again
 * @param version their {@link AppUser}'s version, sent back with a rename
 */
public record UserDetail(
    UUID id,
    String displayName,
    String email,
    String role,
    String status,
    Instant joinedAt,
    boolean invited,
    long version) {

  static UserDetail of(UserDirectoryEntry entry) {
    return new UserDetail(
        entry.getId(),
        entry.getDisplayName(),
        entry.getEmail(),
        entry.getRole(),
        entry.getStatus(),
        entry.getJoinedAt(),
        entry.isInvited(),
        entry.getVersion());
  }
}
