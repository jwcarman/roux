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
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Currency;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.jspecify.annotations.Nullable;
import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.jwcarman.jpa.pagination.PageSpec;
import org.jwcarman.jpa.pagination.SortDirection;
import org.jwcarman.roux.activity.Activity;
import org.jwcarman.roux.activity.ActivityLog;
import org.jwcarman.roux.activity.ActivityRepository;
import org.jwcarman.roux.activity.BusinessActivity;
import org.jwcarman.roux.money.Money;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.support.TransactionTemplate;

import tools.jackson.databind.json.JsonMapper;

/** The activity log on PostgreSQL, with the table migratory made and the app's own mapper. */
@SpringBootTest(classes = ContractTestApplication.class)
@DisplayNameGeneration(ReplaceUnderscores.class)
class ActivityContractTest {

  record Promoted(String rank, Money fee, LocalDate on, @Nullable String note)
      implements BusinessActivity {
    @Override
    public String type() {
      return "student.promoted";
    }

    @Override
    public String describe() {
      return "Promoted to " + rank;
    }
  }

  record FirstPage() implements PageSpec {
    @Override
    public Integer pageIndex() {
      return 0;
    }

    @Override
    public Integer pageSize() {
      return 20;
    }

    @Override
    public String sortBy() {
      return null;
    }

    @Override
    public SortDirection sortDirection() {
      return null;
    }
  }

  private static final Promoted YELLOW =
      new Promoted(
          "Yellow", new Money(1500, Currency.getInstance("USD")), LocalDate.of(2026, 11, 20), null);

  @Autowired ActivityLog log;
  @Autowired ActivityRepository entries;
  @Autowired JsonMapper json;
  @Autowired TransactionTemplate transaction;
  @Autowired JdbcTemplate jdbc;

  private List<Activity> history(ActivityLog from, UUID id) {
    return from.history(id, new FirstPage()).data();
  }

  @Test
  void appends_and_reads_back_a_records_history() {
    UUID student = UUID.randomUUID();
    UUID rank = UUID.randomUUID();
    transaction.executeWithoutResult(status -> log.append(student, YELLOW, rank));

    List<Activity> history = history(log, student);

    assertThat(history).hasSize(1);
    Activity promoted = history.getFirst();
    assertThat(promoted.type()).isEqualTo("student.promoted");
    assertThat(promoted.description()).isEqualTo("Promoted to Yellow");
    assertThat(promoted.actorId()).isNull();
    assertThat(promoted.actorName()).isEqualTo(Activity.SYSTEM);
    assertThat(promoted.details())
        .isEqualTo(
            json.readTree(
                "{\"rank\":\"Yellow\",\"fee\":{\"minorUnits\":1500,\"currency\":\"USD\"},"
                    + "\"on\":\"2026-11-20\",\"note\":null}"));
  }

  @Test
  void a_related_record_finds_it_too() {
    UUID student = UUID.randomUUID();
    UUID rank = UUID.randomUUID();
    transaction.executeWithoutResult(status -> log.append(student, YELLOW, rank));

    assertThat(history(log, rank))
        .extracting(Activity::description)
        .containsExactly("Promoted to Yellow");
  }

  @Test
  void the_later_of_two_at_the_same_instant_comes_first() {
    ActivityLog stopped =
        new ActivityLog(
            entries,
            json,
            Clock.fixed(Instant.parse("2026-11-20T15:00:00Z"), ZoneOffset.UTC),
            ids -> Map.of());
    UUID student = UUID.randomUUID();
    transaction.executeWithoutResult(
        status -> {
          stopped.append(student, YELLOW);
          stopped.append(student, new Promoted("Orange", YELLOW.fee(), YELLOW.on(), "fast"));
        });

    assertThat(history(stopped, student))
        .extracting(Activity::description)
        .containsExactly("Promoted to Orange", "Promoted to Yellow");
  }

  @Test
  void outside_a_transaction_it_is_refused() {
    UUID anchor = UUID.randomUUID();

    assertThatThrownBy(() -> log.append(anchor, YELLOW))
        .isInstanceOf(IllegalTransactionStateException.class);
  }

  @Test
  void a_rolled_back_change_takes_its_activity_with_it() {
    UUID student = UUID.randomUUID();
    transaction.executeWithoutResult(
        status -> {
          log.append(student, YELLOW);
          status.setRollbackOnly();
        });

    assertThat(history(log, student)).isEmpty();
  }

  @Test
  void the_history_outlives_nothing_it_points_at() {
    UUID nothing = UUID.randomUUID();
    transaction.executeWithoutResult(status -> log.append(nothing, YELLOW, UUID.randomUUID()));

    assertThat(history(log, nothing)).hasSize(1);
  }

  @Test
  void a_history_page_reads_through_the_indexes_not_the_whole_table() throws Exception {
    Query query =
        ActivityRepository.class
            .getMethod("history", UUID.class, Pageable.class)
            .getAnnotation(Query.class);
    String id = "'" + UUID.randomUUID() + "'::uuid";
    for (String sql : List.of(query.value(), query.countQuery())) {
      String plan =
          transaction.execute(
              status -> {
                jdbc.execute("set local enable_seqscan = off");
                return String.join(
                    "\n", jdbc.queryForList("explain " + sql.replace(":id", id), String.class));
              });
      assertThat(plan).as(sql).doesNotContain("Seq Scan").contains("ix_roux_activity_related");
    }
  }
}
