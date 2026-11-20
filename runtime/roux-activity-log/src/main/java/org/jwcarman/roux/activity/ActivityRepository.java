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
package org.jwcarman.roux.activity;

import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** {@code roux_activity}'s rows. */
public interface ActivityRepository extends JpaRepository<ActivityEntry, UUID> {

  /**
   * Every activity anchored to {@code id} or related to it, newest first (then by id, so two at the
   * same instant always come in the same order).
   */
  @Query(
      value =
          "select * from roux_activity where anchor_id = :id or :id = any(related_ids)"
              + " order by occurred_at desc, id desc",
      countQuery =
          "select count(*) from roux_activity where anchor_id = :id or :id = any(related_ids)",
      nativeQuery = true)
  Page<ActivityEntry> history(@Param("id") UUID id, Pageable page);
}
