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
package org.jwcarman.roux.jpa;

import java.util.List;
import java.util.function.BooleanSupplier;

import jakarta.persistence.EntityManager;

import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * An insert that may already have been done, which is success and not an error: marking a student
 * present twice (a double tap, two devices), adding someone to a group they are in. The service
 * stays {@code @Transactional}.
 *
 * <pre>{@code
 * @Transactional
 * public Attendee mark(UUID classId, AttendanceRequest request) {
 *   ...
 *   Idempotent.insert(
 *       entityManager,
 *       List.of("attendance", classId, studentId, date),
 *       () -> attendance.existsBySchoolClassIdAndStudentIdAndAttendedOn(classId, studentId, date),
 *       () -> attendance.saveAndFlush(new AttendanceEntity(schoolClass, studentId, date)));
 * }
 * }</pre>
 *
 * <h2>Why a lock, and not catching the violation</h2>
 *
 * <p>The obvious shape (look for the row, insert, catch the unique violation as "already there")
 * cannot be written in a transaction: a violation marks the transaction (and Hibernate's session)
 * rollback-only, so catching it still answers 500 on commit, and the way out is a service with no
 * transaction, which is a trap for the next change. {@code INSERT ... ON CONFLICT DO NOTHING}
 * avoids the violation but bypasses the entity: the id, version and audit columns become the app's
 * to write by hand. A savepoint cannot help either: Hibernate marks its own transaction on the
 * failure.
 *
 * <p>So this takes a transaction-scoped PostgreSQL advisory lock on {@code key} first. Requests for
 * the same key then run one after another; the one that waits sees the winner's row (once it
 * commits) in its {@code exists} check and inserts nothing. The unique constraint stays as the
 * backstop: an insert that does not go through this method still fails loudly, as a 409.
 *
 * <p>It is PostgreSQL's, as roux's other persistence is (who keeps identities there). The lock is
 * released when the transaction ends, so this must be called in one (it throws without).
 */
public final class Idempotent {

  /** Takes the lock; {@code cast} because the function returns void, which JDBC cannot read. */
  private static final String LOCK =
      "select cast(pg_advisory_xact_lock(hashtextextended(:key, 0)) as text)";

  private Idempotent() {}

  /**
   * Inserts unless the row is already there, one request at a time per {@code key}.
   *
   * @param entityManager the transaction's entity manager
   * @param key what makes the row the same row, starting with a name for the kind of row, such as
   *     {@code List.of("attendance", classId, studentId, date)}; two inserts with equal keys wait
   *     for each other, and two with different keys only share a lock by accident, which costs a
   *     wait and nothing else
   * @param exists whether the row is already there (a repository's {@code existsBy...})
   * @param insert does the insert and flushes it ({@code saveAndFlush})
   * @return {@code true} if it inserted, {@code false} if the row was already there
   * @throws IllegalStateException if there is no transaction, in which case the lock would be
   *     released at once and the insert not protected
   */
  public static boolean insert(
      EntityManager entityManager, List<?> key, BooleanSupplier exists, Runnable insert) {
    if (!TransactionSynchronizationManager.isActualTransactionActive()) {
      throw new IllegalStateException(
          "Idempotent.insert needs a transaction: put @Transactional on the service");
    }
    entityManager.createNativeQuery(LOCK).setParameter("key", key.toString()).getSingleResult();
    if (exists.getAsBoolean()) {
      return false;
    }
    insert.run();
    return true;
  }
}
