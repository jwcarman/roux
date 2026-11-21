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

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import jakarta.persistence.EntityManager;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase.Replace;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.jdbc.core.simple.JdbcClient;

/** The filter's conditions, run by PostgreSQL over the directory and over an app's own entity. */
@DataJpaTest(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
@AutoConfigureTestDatabase(replace = Replace.NONE)
@Import(UsersTestApplication.Database.class)
@DisplayNameGeneration(ReplaceUnderscores.class)
class UserFilterQueryTest {

  @Autowired UserDirectory directory;
  @Autowired EntityManager entities;
  @Autowired TestProfiles profiles;
  @Autowired JdbcClient jdbc;

  private final UUID ada = UUID.randomUUID();
  private final UUID grace = UUID.randomUUID();
  private final UUID hedy = UUID.randomUUID();

  private void row(UUID id, String name, String email, String role, String status) {
    jdbc.sql(
            "insert into roux_user_directory"
                + " (id, version, display_name, email, role, status, joined_at, invited)"
                + " values (?, 0, ?, ?, ?, ?, ?, false)")
        .params(id, name, email, role, status, Timestamp.from(Instant.EPOCH))
        .update();
  }

  @BeforeEach
  void people() {
    row(ada, "Ada Lovelace", "ada@example.org", "MEMBER", "ACTIVE");
    row(grace, "Grace Hopper", "grace_h@example.org", "INSTRUCTOR", "ACTIVE");
    row(hedy, "Hedy Lamarr", "hedy@example.org", "MEMBER", "DEACTIVATED");
  }

  private List<UUID> found(UserFilter filter) {
    return directory.findAll(filter.specification(), Sort.by("displayName")).stream()
        .map(UserDirectoryEntry::getId)
        .toList();
  }

  @Nested
  class Status {

    @Test
    void the_default_is_the_active_users() {
      assertThat(found(new UserFilter(null, null, null))).containsExactly(ada, grace);
    }

    @Test
    void deactivated_finds_only_them() {
      assertThat(found(new UserFilter(null, null, UserStatus.DEACTIVATED))).containsExactly(hedy);
    }
  }

  @Nested
  class Role {

    @Test
    void finds_only_that_role() {
      assertThat(found(new UserFilter(null, "INSTRUCTOR", null))).containsExactly(grace);
    }
  }

  @Nested
  class Search {

    @Test
    void matches_a_name_whatever_its_case() {
      assertThat(found(new UserFilter("LOVEL", null, null))).containsExactly(ada);
    }

    @Test
    void matches_an_email() {
      assertThat(found(new UserFilter("grace_h@", null, null))).containsExactly(grace);
    }

    @Test
    void needs_every_word_in_the_name_or_the_email() {
      assertThat(found(new UserFilter("ada example", null, null))).containsExactly(ada);
      assertThat(found(new UserFilter("ada hopper", null, null))).isEmpty();
    }

    @Test
    void takes_wildcards_literally() {
      assertThat(found(new UserFilter("%", null, null))).isEmpty();
      assertThat(found(new UserFilter("e_h", null, null))).containsExactly(grace);
    }

    @Test
    void a_blank_search_finds_everyone() {
      assertThat(found(new UserFilter("  ", null, null))).containsExactly(ada, grace);
    }

    @Test
    void with_a_role_and_a_status_needs_all_three() {
      assertThat(found(new UserFilter("hedy", "MEMBER", UserStatus.DEACTIVATED)))
          .containsExactly(hedy);
      assertThat(found(new UserFilter("hedy", "INSTRUCTOR", UserStatus.DEACTIVATED))).isEmpty();
    }
  }

  @Test
  void an_entry_reads_its_joined_date_and_invited_flag() {
    UUID kate = UUID.randomUUID();
    jdbc.sql(
            "insert into roux_user_directory"
                + " (id, version, display_name, email, role, status, joined_at, invited)"
                + " values (?, 0, 'Katherine Johnson', 'kate@example.org', 'MEMBER', 'ACTIVE', ?,"
                + " true)")
        .params(kate, Timestamp.from(Instant.parse("2026-11-20T15:00:00Z")))
        .update();

    UserDirectoryEntry entry = directory.findById(kate).orElseThrow();

    assertThat(entry.getJoinedAt()).isEqualTo(Instant.parse("2026-11-20T15:00:00Z"));
    assertThat(entry.isInvited()).isTrue();
  }

  @Nested
  class Over_an_apps_own_entity {

    private AppUser user(UUID id, String name) {
      AppUser user = new AppUser(id, name);
      entities.persist(user);
      return user;
    }

    @Test
    void its_id_is_the_users() {
      entities.persist(new TestProfile(user(ada, "Ada Lovelace"), "black"));
      entities.flush();
      entities.clear();

      TestProfile profile = entities.find(TestProfile.class, ada);
      assertThat(profile.user.getDisplayName()).isEqualTo("Ada Lovelace");
      assertThat(profile.entry.getEmail()).isEqualTo("ada@example.org");
    }

    @Test
    void the_same_conditions_apply_through_its_join() {
      entities.persist(new TestProfile(user(ada, "Ada Lovelace"), "black"));
      entities.persist(new TestProfile(user(grace, "Grace Hopper"), "brown"));
      entities.persist(new TestProfile(user(hedy, "Hedy Lamarr"), "white"));
      entities.flush();
      entities.clear();
      Specification<TestProfile> spec =
          new UserFilter("example", "MEMBER", null).specification(root -> root.join("entry"));

      List<String> belts = profiles.findAll(spec).stream().map(profile -> profile.belt).toList();

      assertThat(belts).containsExactly("black");
    }
  }
}
