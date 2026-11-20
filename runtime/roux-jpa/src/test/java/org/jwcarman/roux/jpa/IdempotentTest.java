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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.transaction.support.TransactionSynchronizationManager;

class IdempotentTest {

  private final EntityManager entityManager = mock(EntityManager.class);
  private final Query lock = mock(Query.class);
  private final List<String> calls = new ArrayList<>();
  private final UUID classId = UUID.fromString("00000000-0000-0000-0000-000000000001");

  @BeforeEach
  void inATransaction() {
    TransactionSynchronizationManager.setActualTransactionActive(true);
    when(entityManager.createNativeQuery(anyString())).thenReturn(lock);
    when(lock.setParameter(anyString(), anyString())).thenReturn(lock);
  }

  @AfterEach
  void clear() {
    TransactionSynchronizationManager.setActualTransactionActive(false);
  }

  @Test
  void insertsWhenTheRowIsNotThereAndSaysSo() {
    boolean inserted =
        Idempotent.insert(
            entityManager,
            List.of("attendance", classId),
            () -> {
              calls.add("exists");
              return false;
            },
            () -> calls.add("insert"));

    assertThat(inserted).isTrue();
    assertThat(calls).containsExactly("exists", "insert");
  }

  @Test
  void insertsNothingWhenTheRowIsAlreadyThereAndSaysSo() {
    boolean inserted =
        Idempotent.insert(
            entityManager, List.of("attendance"), () -> true, () -> calls.add("insert"));

    assertThat(inserted).isFalse();
    assertThat(calls).isEmpty();
  }

  @Test
  void takesTheTransactionsAdvisoryLockOnTheKeyBeforeLooking() {
    Idempotent.insert(
        entityManager,
        List.of("attendance", classId),
        () -> {
          calls.add("exists");
          return true;
        },
        () -> {});

    InOrder order = inOrder(entityManager, lock);
    order
        .verify(entityManager)
        .createNativeQuery("select cast(pg_advisory_xact_lock(hashtextextended(:key, 0)) as text)");
    order.verify(lock).setParameter("key", "[attendance, " + classId + "]");
    order.verify(lock).getSingleResult();
    assertThat(calls).containsExactly("exists");
  }

  @Test
  void refusesWithoutATransactionBecauseTheLockWouldBeReleasedAtOnce() {
    TransactionSynchronizationManager.setActualTransactionActive(false);
    List<String> tables = List.of("attendance");

    assertThatThrownBy(
            () -> Idempotent.insert(entityManager, tables, () -> false, () -> calls.add("insert")))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("Idempotent.insert needs a transaction: put @Transactional on the service");

    verify(entityManager, never()).createNativeQuery(anyString());
    assertThat(calls).isEmpty();
  }
}
