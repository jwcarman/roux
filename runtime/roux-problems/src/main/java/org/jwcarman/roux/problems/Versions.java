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
package org.jwcarman.roux.problems;

import org.jspecify.annotations.Nullable;
import org.jwcarman.jpa.entity.BaseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

/**
 * The check an edit makes before it changes anything: the client must say which version of the
 * record it read, and that must still be the current one. Call it first in a service's update:
 *
 * <pre>{@code
 * RankEntity rank = find(id);
 * Versions.require(rank, request.version());
 * }</pre>
 *
 * <p>It lives here, beside the exceptions it throws, rather than in a persistence module: it
 * depends only on jpa-utils' {@link BaseEntity}, whose {@code version} every roux entity has, and
 * it answers as the advices already answer ({@link InvalidFieldException}, and the 409 for an
 * optimistic-locking failure).
 */
public final class Versions {

  private Versions() {}

  /**
   * Refuses an edit made from a stale read.
   *
   * @param entity the record as it is now
   * @param read the version the client read, or {@code null} if it sent none
   * @throws InvalidFieldException on {@code version}, {@code Must not be empty}, if {@code read} is
   *     {@code null}
   * @throws ObjectOptimisticLockingFailureException (answered as a 409) if {@code entity} has
   *     changed since {@code read}
   */
  public static void require(BaseEntity entity, @Nullable Long read) {
    if (read == null) {
      throw new InvalidFieldException("version", "Must not be empty");
    }
    if (!read.equals(entity.getVersion())) {
      throw new ObjectOptimisticLockingFailureException(entity.getClass(), entity.getId());
    }
  }
}
