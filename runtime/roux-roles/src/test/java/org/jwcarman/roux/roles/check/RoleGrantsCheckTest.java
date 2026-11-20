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
package org.jwcarman.roux.roles.check;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.sql.ResultSet;
import java.util.List;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.roles.check.RoleGrantsCheck.Grant;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.simple.JdbcClient;

@DisplayNameGeneration(ReplaceUnderscores.class)
class RoleGrantsCheckTest {

  private static final List<String> KNOWN = List.of("a.read", "a.write");

  @Test
  void owner_holding_exactly_the_constants_and_known_grants_pass() {
    List<Grant> grants =
        List.of(
            new Grant("OWNER", "a.read"),
            new Grant("OWNER", "a.write"),
            new Grant("MEMBER", "a.read"));

    assertThat(RoleGrantsCheck.problems(grants, KNOWN)).isEmpty();
  }

  @Test
  void every_problem_is_named_one_per_line_sorted() {
    List<Grant> grants =
        List.of(
            new Grant("OWNER", "a.read"),
            new Grant("OWNER", "b.extra"),
            new Grant("TYPO", "a.raed"));

    assertThat(RoleGrantsCheck.problems(grants, KNOWN))
        .containsExactly(
            "OWNER holds b.extra, which no constant declares",
            "OWNER lacks a.write",
            "TYPO grants a.raed, which no constant declares");
  }

  @Test
  void a_database_with_no_owner_lacks_everything() {
    assertThat(RoleGrantsCheck.problems(List.of(), KNOWN))
        .containsExactly("OWNER lacks a.read", "OWNER lacks a.write");
  }

  @Test
  void the_message_lists_every_problem() {
    assertThatCode(() -> RoleGrantsCheck.fail(List.of("OWNER lacks a.read", "OWNER lacks a.write")))
        .isInstanceOf(AssertionError.class)
        .hasMessage(
            "The roles' grants do not match the permission constants:\n  OWNER lacks a.read\n  OWNER lacks a.write");
  }

  @Test
  void no_problems_pass() {
    assertThatCode(() -> RoleGrantsCheck.fail(List.of())).doesNotThrowAnyException();
  }

  @Test
  void check_reads_who_rbac_s_grants() throws Exception {
    JdbcClient jdbc = mock(JdbcClient.class, RETURNS_DEEP_STUBS);
    ArgumentCaptor<RowMapper<Grant>> mapper = ArgumentCaptor.captor();
    when(jdbc.sql(contains("who_role_permission")).query(mapper.capture()).list())
        .thenReturn(List.of(new Grant("OWNER", "a.read")));

    assertThatThrownBy(() -> RoleGrantsCheck.check(jdbc, KNOWN))
        .isInstanceOf(AssertionError.class)
        .hasMessageContaining("OWNER lacks a.write");

    ResultSet row = mock(ResultSet.class);
    when(row.getString(1)).thenReturn("MEMBER");
    when(row.getString(2)).thenReturn("a.read");
    assertThat(mapper.getValue().mapRow(row, 0)).isEqualTo(new Grant("MEMBER", "a.read"));
  }

  @Test
  void check_passes_when_the_grants_match() {
    JdbcClient jdbc = mock(JdbcClient.class, RETURNS_DEEP_STUBS);
    when(jdbc.sql(contains("who_role_permission"))
            .query(ArgumentCaptor.<RowMapper<Grant>>captor().capture())
            .list())
        .thenReturn(List.of(new Grant("OWNER", "a.read"), new Grant("OWNER", "a.write")));

    assertThatCode(() -> RoleGrantsCheck.check(jdbc, KNOWN)).doesNotThrowAnyException();
  }
}
