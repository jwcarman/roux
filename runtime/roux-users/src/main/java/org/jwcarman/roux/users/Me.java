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

import java.util.UUID;

/**
 * The signed-in user, as they see themselves.
 *
 * @param id their identity's id
 * @param displayName the name the app shows
 * @param email their oldest sign-in address; changed through who's {@code /who/me/email-addresses}
 * @param version their {@link AppUser}'s version, sent back with a rename
 */
public record Me(UUID id, String displayName, String email, long version) {

  static Me of(UserDirectoryEntry entry) {
    return new Me(entry.getId(), entry.getDisplayName(), entry.getEmail(), entry.getVersion());
  }
}
