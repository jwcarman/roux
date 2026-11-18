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
package org.jwcarman.roux.contracts;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;

import org.junit.jupiter.api.Test;
import org.jwcarman.roux.jpa.Idempotent;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * {@code Idempotent.insert} against the real database, inside real transactions: twelve requests
 * for one row all succeed, one of them inserts, and the unique constraint is never violated.
 */
@SpringBootTest(classes = ContractTestApplication.class)
class IdempotentContractTest {

  private static final int REQUESTS = 12;

  @PersistenceContext EntityManager entityManager;
  @Autowired TransactionTemplate transactions;
  @Autowired JdbcTemplate jdbc;

  @Test
  void aRaceForOneRowInsertsItOnceAndEveryRequestSucceeds() throws Exception {
    jdbc.execute("drop table if exists idempotent_marks");
    jdbc.execute("create table idempotent_marks (id uuid primary key, mark text unique not null)");
    ExecutorService pool = Executors.newFixedThreadPool(REQUESTS);
    CountDownLatch go = new CountDownLatch(1);
    try {
      List<Future<Boolean>> requests = new ArrayList<>();
      for (int i = 0; i < REQUESTS; i++) {
        requests.add(
            pool.submit(
                () -> {
                  go.await();
                  return transactions.execute(status -> mark("ada@5"));
                }));
      }
      go.countDown();

      int inserted = 0;
      for (Future<Boolean> request : requests) {
        if (request.get()) {
          inserted++;
        }
      }

      assertThat(inserted).isEqualTo(1);
      assertThat(jdbc.queryForObject("select count(*) from idempotent_marks", Integer.class))
          .isEqualTo(1);
    } finally {
      pool.shutdownNow();
      jdbc.execute("drop table idempotent_marks");
    }
  }

  private boolean mark(String mark) {
    return Idempotent.insert(
        entityManager,
        List.of("idempotent_marks", mark),
        () ->
            jdbc.queryForObject(
                    "select count(*) from idempotent_marks where mark = ?", Integer.class, mark)
                > 0,
        () ->
            jdbc.update(
                "insert into idempotent_marks (id, mark) values (?, ?)", UUID.randomUUID(), mark));
  }
}
