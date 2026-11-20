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
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.roles.MemberJoined;
import org.jwcarman.roux.roles.OwnerBootstrap;
import org.jwcarman.roux.roles.RouxRoles;
import org.jwcarman.who.core.service.WhoService;
import org.jwcarman.who.emaillink.EmailAddressTakenException;
import org.jwcarman.who.emaillink.EmailCredentialService;
import org.jwcarman.who.rbac.RbacService;
import org.jwcarman.who.rbac.Role;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Import;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;

/** Test people are made as real members are: one transaction, one {@link MemberJoined}. */
@AppTest
@Import(TestMembersTest.Joined.class)
class TestMembersTest {

  @Autowired TestMembers members;
  @Autowired Joined joined;
  @Autowired JdbcTemplate jdbc;
  @Autowired EmailCredentialService emails;
  @Autowired OwnerBootstrap bootstrap;
  @Autowired TestClock clock;
  @Autowired MockMvc mvc;
  @Autowired WhoService who;
  @Autowired RbacService rbac;
  @Autowired ApplicationEventPublisher events;
  @Autowired PlatformTransactionManager transactions;

  /** Records every {@link MemberJoined}, and refuses it when told to. */
  @TestConfiguration(proxyBeanMethods = false)
  static class Joined {
    final List<MemberJoined> events = new CopyOnWriteArrayList<>();
    volatile boolean refuse;

    @EventListener
    void on(MemberJoined event) {
      if (refuse) {
        throw new IllegalStateException("refused by the test");
      }
      events.add(event);
    }
  }

  @BeforeEach
  void cleanSlate() {
    joined.refuse = false;
    members.reset();
    joined.events.clear();
  }

  private int identities() {
    return jdbc.queryForObject("select count(*) from who_identity", Integer.class);
  }

  private boolean roleExists(String name) {
    return jdbc.queryForObject(
        "select exists (select 1 from who_role where name = ?)", Boolean.class, name);
  }

  @Test
  void a_signed_in_member_holds_the_role() {
    TestMember ada = members.signedIn("Ada Lovelace", "ada@example.org", "MEMBER");

    assertThat(
            jdbc.queryForList(
                "select r.name from who_identity_role ir join who_role r on r.id = ir.role_id"
                    + " where ir.identity_id = ?",
                String.class,
                ada.id()))
        .containsExactly("MEMBER");
  }

  @Test
  void members_made_later_keep_the_roles_present_when_they_were_made() {
    TestMembers later =
        new TestMembers(jdbc, bootstrap, clock, mvc, who, rbac, emails, events, transactions);
    jdbc.update("insert into who_role (id, name) values (?, 'TEMP')", UUID.randomUUID());

    later.reset();

    assertThat(roleExists("TEMP")).isFalse();
    assertThat(roleExists("MEMBER")).isTrue();
  }

  @Test
  void signed_in_people_join_as_members_do() {
    TestMember ada = members.signedIn("Ada Lovelace", " Ada@Example.org ", "MEMBER");

    assertThat(joined.events)
        .containsExactly(new MemberJoined(ada.id(), "Ada Lovelace", "ada@example.org"));
  }

  @Test
  void a_listener_that_throws_leaves_no_one_behind() {
    int before = identities();
    joined.refuse = true;

    assertThatThrownBy(() -> members.signedIn("Ada Lovelace", "ada@example.org", "MEMBER"))
        .hasMessageContaining("refused by the test");

    assertThat(identities()).isEqualTo(before);
    assertThat(emails.findByAddress("ada@example.org")).isEmpty();
  }

  @Test
  void an_address_already_registered_is_refused_whole() {
    members.signedIn("Ada Lovelace", "ada@example.org", "MEMBER");
    int before = identities();

    assertThatThrownBy(() -> members.signedIn("Ada Again", "ada@example.org", "MEMBER"))
        .isInstanceOf(EmailAddressTakenException.class);

    assertThat(identities()).isEqualTo(before);
    assertThat(joined.events).hasSize(1);
  }

  @Test
  void reset_removes_roles_a_test_made_and_keeps_the_apps() {
    Role temp = new Role(UUID.randomUUID(), "TEMP");
    jdbc.update("insert into who_role (id, name) values (?, ?)", temp.id(), temp.name());
    members.signedIn("Ada Lovelace", "ada@example.org", temp);

    members.reset();

    assertThat(roleExists("TEMP")).isFalse();
    assertThat(roleExists("MEMBER")).isTrue();
    assertThat(roleExists(RouxRoles.OWNER)).isTrue();
  }

  @Test
  void reset_makes_the_owner_again_as_a_member_who_joined() {
    members.reset();

    assertThat(joined.events)
        .singleElement()
        .satisfies(
            owner -> {
              assertThat(owner.name()).isEqualTo("Test Owner");
              assertThat(owner.email()).isEqualTo(TestMembers.OWNER_EMAIL);
            });
  }

  @Test
  void an_unknown_role_is_named_with_the_roles_there_are() {
    assertThatThrownBy(() -> members.signedIn("Ada Lovelace", "ada@example.org", "MEMBR"))
        .hasMessageContaining("MEMBR")
        .hasMessageContaining("MEMBER");
  }
}
