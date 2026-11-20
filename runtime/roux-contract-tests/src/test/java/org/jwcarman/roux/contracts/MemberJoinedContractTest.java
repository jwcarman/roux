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

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.roles.MemberInvitations;
import org.jwcarman.roux.roles.MemberJoined;
import org.jwcarman.who.emaillink.EmailCredentialService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;

/** An invitation through roux: the member joins inside who's transaction, or not at all. */
@SpringBootTest(classes = ContractTestApplication.class)
@Import(MemberJoinedContractTest.Joined.class)
@DisplayNameGeneration(ReplaceUnderscores.class)
class MemberJoinedContractTest {

  @Autowired MemberInvitations invitations;
  @Autowired EmailCredentialService emails;
  @Autowired JdbcClient jdbc;
  @Autowired Joined joined;

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
  void aRoleToInviteAndNoEventsYet() {
    jdbc.sql("insert into who_role (id, name) values (?, 'MEMBER') on conflict (name) do nothing")
        .param(UUID.randomUUID())
        .update();
    joined.events.clear();
    joined.refuse = false;
  }

  @Test
  void an_invited_member_joins_once_with_their_name() {
    String address = UUID.randomUUID() + "@roux.test";

    invitations.invite("Ada Lovelace", address, "MEMBER");

    assertThat(joined.events).hasSize(1);
    MemberJoined ada = joined.events.getFirst();
    assertThat(ada.name()).isEqualTo("Ada Lovelace");
    assertThat(ada.email()).isEqualTo(address);
    assertThat(emails.findByAddress(address)).isPresent();
  }

  @Test
  void a_listener_that_refuses_takes_the_invitation_back() {
    joined.refuse = true;
    String address = UUID.randomUUID() + "@roux.test";

    assertThatThrownBy(() -> invitations.invite("Grace Hopper", address, "MEMBER"))
        .hasMessageContaining("refused by the test");

    assertThat(emails.findByAddress(address)).isEmpty();
  }
}
