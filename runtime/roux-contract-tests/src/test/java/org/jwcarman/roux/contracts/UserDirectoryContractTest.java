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

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.roles.UserInvitations;
import org.jwcarman.roux.users.UserDirectory;
import org.jwcarman.roux.users.UserDirectoryEntry;
import org.jwcarman.roux.users.UserFilter;
import org.jwcarman.roux.users.UserRow;
import org.jwcarman.roux.users.UserStatus;
import org.jwcarman.who.core.event.SignInMethod;
import org.jwcarman.who.core.repository.IdentityRepository;
import org.jwcarman.who.core.service.WhoService;
import org.jwcarman.who.core.service.WhoSessions;
import org.jwcarman.who.emaillink.EmailCredentialService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;

/** The directory view over who's tables: what each user shows, read from who. */
@SpringBootTest(classes = ContractTestApplication.class)
@DisplayNameGeneration(ReplaceUnderscores.class)
class UserDirectoryContractTest {

  @Autowired UserInvitations invitations;
  @Autowired UserDirectory directory;
  @Autowired EmailCredentialService emails;
  @Autowired WhoService who;
  @Autowired IdentityRepository identities;
  @Autowired WhoSessions sessions;
  @Autowired JdbcClient jdbc;

  private UUID ada;
  private String adaEmail;

  @BeforeEach
  void adaJoins() {
    jdbc.sql("insert into who_role (id, name) values (?, 'MEMBER') on conflict (name) do nothing")
        .param(UUID.randomUUID())
        .update();
    adaEmail = "ada-" + UUID.randomUUID() + "@roux.test";
    ada = invitations.invite("Ada Lovelace", adaEmail, "MEMBER").identityId();
  }

  private UserDirectoryEntry entry(UUID id) {
    return directory.findById(id).orElseThrow();
  }

  @Test
  void a_user_shows_their_name_address_role_and_status() {
    assertThat(UserRow.of(entry(ada)))
        .isEqualTo(new UserRow(ada, "Ada Lovelace", adaEmail, "MEMBER", "ACTIVE"));
    assertThat(entry(ada).getJoinedAt()).isNotNull();
  }

  @Test
  void a_second_address_does_not_replace_the_first_and_is_not_searched() {
    String second = "aaa-" + UUID.randomUUID() + "@roux.test";
    emails.register(identities.findById(ada).orElseThrow(), second);

    assertThat(entry(ada).getEmail()).isEqualTo(adaEmail);
    assertThat(directory.findAll(new UserFilter(second, null, null).specification())).isEmpty();
  }

  @Test
  void a_deactivated_user_shows_as_deactivated_and_only_when_asked() {
    who.deactivate(ada);

    assertThat(entry(ada).getStatus()).isEqualTo("DEACTIVATED");
    assertThat(directory.findAll(new UserFilter(adaEmail, null, null).specification())).isEmpty();
    assertThat(
            directory.findAll(
                new UserFilter(adaEmail, null, UserStatus.DEACTIVATED).specification()))
        .extracting(UserDirectoryEntry::getId)
        .containsExactly(ada);
  }

  @Test
  void a_user_is_invited_until_they_first_sign_in() {
    assertThat(entry(ada).isInvited()).isTrue();

    UUID credential = emails.findByAddress(adaEmail).orElseThrow().id();
    sessions.start(ada, credential, SignInMethod.EMAIL_LINK, null);

    assertThat(entry(ada).isInvited()).isFalse();
  }

  @Test
  void the_version_is_the_app_users() {
    assertThat(entry(ada).getVersion()).isZero();
  }
}
