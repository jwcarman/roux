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
package org.jwcarman.roux.test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.who.emaillink.EmailCredentialService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/** What every {@link AppTest} gets: a database, signed-in users, a clean slate and a clock. */
@AppTest
class AppTestTest {

  @Autowired TestUsers users;
  @Autowired TestClock testClock;
  @Autowired Clock clock;
  @Autowired JdbcTemplate jdbc;
  @Autowired EmailCredentialService emailCredentials;

  @BeforeEach
  void cleanSlate() {
    users.reset();
  }

  @Test
  void runsOnTheTestDatabase() {
    String database = jdbc.queryForObject("select current_database()", String.class);
    assertThat(database).startsWith("app_test_");
  }

  @Test
  void signsInAMemberWithARole() throws Exception {
    TestUser ada = users.signedIn("Ada Lovelace", "ada@example.org", "MEMBER");

    ada.perform(get("/api/roles/invitable")).andExpect(status().isOk());
    assertThat(ada.id()).isNotNull();
  }

  @Test
  void anAnonymousBrowserIsNotSignedIn() throws Exception {
    users.anonymous().perform(get("/api/roles/invitable")).andExpect(status().isUnauthorized());
  }

  @Test
  void theOwnerIsSignedIn() throws Exception {
    users.owner().perform(get("/api/roles/invitable")).andExpect(status().isOk());
  }

  @Test
  void resetLeavesOnlyTheOwner() {
    users.signedIn("Ada Lovelace", "ada@example.org", "MEMBER");

    users.reset();

    assertThat(emailCredentials.findByAddress("ada@example.org")).isEmpty();
    assertThat(emailCredentials.findByAddress(TestUsers.OWNER_EMAIL)).isPresent();
  }

  @Test
  void resetEmptiesTheTablesTheAppFilledWithoutBeingTold() {
    jdbc.update(
        "insert into roux_activity (id, version, occurred_at, anchor_id, type, description, details)"
            + " values (gen_random_uuid(), 0, now(), gen_random_uuid(), 'x.y', 'y', '{}')");

    users.reset();

    assertThat(jdbc.queryForObject("select count(*) from roux_activity", Integer.class)).isZero();
  }

  @Test
  void resetKeepsWhatTheMigrationsMade() {
    users.reset();

    assertThat(jdbc.queryForObject("select count(*) from who_role_permission", Integer.class))
        .isPositive();
    assertThat(jdbc.queryForObject("select count(*) from databasechangelog", Integer.class))
        .isPositive();
    assertThat(jdbc.queryForList("select name from who_role", String.class)).contains("OWNER");
  }

  @Test
  void theClockIsTheAppsAndRunsInUtcOnRealTime() {
    assertThat(clock).isSameAs(testClock);
    assertThat(clock.getZone()).isEqualTo(ZoneOffset.UTC);
    assertThat(Duration.between(clock.instant(), Instant.now()).abs())
        .isLessThan(Duration.ofSeconds(5));
  }

  @Test
  void theClockStopsWhereItIsSetAndMovesWhenAdvanced() {
    testClock.set("2026-11-10T17:32:00Z");
    assertThat(clock.instant()).isEqualTo(Instant.parse("2026-11-10T17:32:00Z"));

    testClock.advance(Duration.ofDays(1));
    assertThat(clock.instant()).isEqualTo(Instant.parse("2026-11-11T17:32:00Z"));
  }

  @Test
  void theClockInAnotherZoneIsTheSameInstant() {
    testClock.set("2026-11-10T17:32:00Z");
    ZoneId newYork = ZoneId.of("America/New_York");

    Clock there = clock.withZone(newYork);

    assertThat(there.getZone()).isEqualTo(newYork);
    assertThat(there.instant()).isEqualTo(Instant.parse("2026-11-10T17:32:00Z"));
  }

  @Test
  void resetPutsTheClockBackOnRealTime() {
    testClock.set("2020-01-01T00:00:00Z");

    users.reset();

    assertThat(clock.instant()).isAfter(Instant.parse("2025-01-01T00:00:00Z"));
  }
}
