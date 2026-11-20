package org.jwcarman.roux.examples.dojo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.examples.dojo.identity.Roles;
import org.jwcarman.who.emaillink.EmailCredentialService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/** What every {@link AppTest} gets: a database, signed-in members, a clean slate and a clock. */
@AppTest
class AppTestTest {

  @Autowired TestMembers members;
  @Autowired TestClock testClock;
  @Autowired Clock clock;
  @Autowired JdbcTemplate jdbc;
  @Autowired EmailCredentialService emailCredentials;

  @BeforeEach
  void cleanSlate() {
    members.reset();
  }

  @Test
  void runsOnTheTestDatabase() {
    String database = jdbc.queryForObject("select current_database()", String.class);
    assertThat(database).startsWith("app_test_");
  }

  @Test
  void signsInAMemberWithARoleAndAProfile() throws Exception {
    TestMember ada = members.signedIn("Ada Lovelace", "ada@example.org", Roles.MEMBER);

    ada.perform(get("/api/members/me"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.displayName").value("Ada Lovelace"))
        .andExpect(jsonPath("$.email").value("ada@example.org"));
    assertThat(ada.id()).isNotNull();
  }

  @Test
  void signsInTheOwnerTheAppCreatedAtStartup() throws Exception {
    members.owner().perform(get("/api/members")).andExpect(status().isOk());
  }

  @Test
  void resetLeavesOnlyTheOwner() {
    members.signedIn("Ada Lovelace", "ada@example.org", Roles.MEMBER);

    members.reset();

    assertThat(emailCredentials.findByAddress("ada@example.org")).isEmpty();
    assertThat(emailCredentials.findByAddress("owner@example.com")).isPresent();
  }

  @Test
  void resetEmptiesTheTablesItIsGiven() {
    jdbc.update(
        "insert into activity (id, version, occurred_at, subject_type, subject_id, action, summary)"
            + " values (gen_random_uuid(), 0, now(), 'member', gen_random_uuid(), 'x', 'y')");

    members.reset("activity");

    assertThat(jdbc.queryForObject("select count(*) from activity", Integer.class)).isZero();
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
  void resetPutsTheClockBackOnRealTime() {
    testClock.set("2020-01-01T00:00:00Z");

    members.reset();

    assertThat(clock.instant()).isAfter(Instant.parse("2025-01-01T00:00:00Z"));
  }
}
