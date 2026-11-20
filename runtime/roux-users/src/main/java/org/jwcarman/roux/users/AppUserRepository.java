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

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

/** The app's users, by identity id. */
public interface AppUserRepository extends JpaRepository<AppUser, UUID> {

  /**
   * Records when a user first signed in, if it is not recorded yet; a later sign-in changes
   * nothing. It does not change the user's version: it is not an edit.
   *
   * @param id the user's id
   * @param at when they signed in
   * @return 1 when it was their first, 0 otherwise (or for no such user)
   */
  @Transactional
  @Modifying
  @Query(
      value =
          "update roux_user set first_signed_in_at = :at"
              + " where id = :id and first_signed_in_at is null",
      nativeQuery = true)
  int recordFirstSignIn(@Param("id") UUID id, @Param("at") Instant at);
}
