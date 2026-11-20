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

import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.roles.UserInvitations;
import org.jwcarman.roux.roles.UserJoined;
import org.jwcarman.roux.users.AppUser;
import org.jwcarman.roux.users.AppUserRepository;
import org.jwcarman.who.core.service.WhoService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;

/** Everyone who joins gets an AppUser, made before the app's own listeners run. */
@SpringBootTest(classes = ContractTestApplication.class)
@Import(AppUserContractTest.AppListener.class)
@DisplayNameGeneration(ReplaceUnderscores.class)
class AppUserContractTest {

  @Autowired UserInvitations invitations;
  @Autowired AppUserRepository users;
  @Autowired WhoService who;
  @Autowired JdbcClient jdbc;
  @Autowired AppListener listener;

  /** An app's own listener, in the default order: it sees the user roux made, or refuses. */
  @TestConfiguration(proxyBeanMethods = false)
  static class AppListener {
    @Autowired AppUserRepository users;
    volatile Optional<AppUser> seen = Optional.empty();
    volatile boolean refuse;

    @EventListener
    void on(UserJoined joined) {
      if (refuse) {
        throw new IllegalStateException("refused by the app");
      }
      seen = users.findById(joined.identityId());
    }
  }

  @BeforeEach
  void aRoleToInvite() {
    jdbc.sql("insert into who_role (id, name) values (?, 'MEMBER') on conflict (name) do nothing")
        .param(UUID.randomUUID())
        .update();
    listener.seen = Optional.empty();
    listener.refuse = false;
  }

  private String address() {
    return UUID.randomUUID() + "@roux.test";
  }

  @Test
  void the_first_owner_is_a_user_with_the_configured_name() {
    String name =
        jdbc.sql(
                "select u.display_name from roux_user u"
                    + " join who_credential_identity ci on ci.identity_id = u.id"
                    + " join who_email_credential e on e.id = ci.credential_id"
                    + " where e.address = 'owner@roux.test'")
            .query(String.class)
            .single();

    assertThat(name).isEqualTo("Contract Owner");
  }

  @Test
  void an_invited_person_is_a_user_with_their_name() {
    UUID id = invitations.invite("  Ada Lovelace ", address(), "MEMBER").identityId();

    assertThat(users.findById(id)).map(AppUser::getDisplayName).contains("Ada Lovelace");
  }

  @Test
  void the_apps_listener_finds_the_user_already_made() {
    UUID id = invitations.invite("Grace Hopper", address(), "MEMBER").identityId();

    assertThat(listener.seen).map(AppUser::getId).contains(id);
  }

  @Test
  void a_listener_that_refuses_leaves_no_user() {
    listener.refuse = true;
    long before = users.count();

    assertThatThrownBy(() -> invitations.invite("Hedy Lamarr", address(), "MEMBER"))
        .hasMessageContaining("refused by the app");

    assertThat(users.count()).isEqualTo(before);
  }

  @Test
  void deleting_the_identity_deletes_the_user() {
    UUID id = invitations.invite("Joan Clarke", address(), "MEMBER").identityId();

    who.deleteIdentity(id);

    assertThat(users.findById(id)).isEmpty();
  }
}
