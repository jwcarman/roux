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
package org.jwcarman.roux.roles;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.jwcarman.who.core.domain.Identity;
import org.jwcarman.who.core.domain.IdentityStatus;
import org.jwcarman.who.core.service.WhoService;
import org.jwcarman.who.emaillink.EmailAddressTakenException;
import org.jwcarman.who.emaillink.EmailCredential;
import org.jwcarman.who.emaillink.EmailCredentialService;
import org.jwcarman.who.rbac.RbacService;
import org.jwcarman.who.rbac.Role;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;

/**
 * The bootstrap's decisions, with who and the database mocked; the contract tests run it on
 * PostgreSQL.
 */
@DisplayNameGeneration(ReplaceUnderscores.class)
class OwnerBootstrapTest {

  private static final String EMAIL = "owner@example.com";

  private final JdbcClient jdbc = mock(JdbcClient.class, RETURNS_DEEP_STUBS);
  private final RbacService rbac = mock(RbacService.class);
  private final WhoService who = mock(WhoService.class);
  private final EmailCredentialService emails = mock(EmailCredentialService.class);
  private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
  private final PlatformTransactionManager transactions = mock(PlatformTransactionManager.class);
  private final OwnerBootstrap bootstrap =
      new OwnerBootstrap(jdbc, rbac, who, emails, events, transactions, EMAIL, "Pat");
  private final Role owner = new Role(UUID.randomUUID(), RouxRoles.OWNER);

  private final UUID id = UUID.randomUUID();
  private final Identity identity =
      new Identity(id, IdentityStatus.ACTIVE, Instant.EPOCH, Instant.EPOCH);

  private void activeOwner(Boolean first, Boolean... later) {
    when(jdbc.sql(contains("exists")).param(any()).query(Boolean.class).single())
        .thenReturn(first, later);
  }

  private void whoCreates() {
    when(who.createIdentity()).thenReturn(identity);
    when(rbac.findRequiredRole(RouxRoles.OWNER)).thenReturn(owner);
  }

  @Test
  void an_active_owner_means_nothing_is_made() {
    activeOwner(true);

    bootstrap.run(null);

    verify(who, never()).createIdentity();
  }

  @Test
  void no_active_owner_makes_one_and_says_so() {
    activeOwner(false);
    whoCreates();
    when(emails.register(identity, EMAIL))
        .thenReturn(new EmailCredential(UUID.randomUUID(), EMAIL));

    bootstrap.run(null);

    verify(events).publishEvent(new MemberJoined(id, "Pat", EMAIL));
    verify(rbac).assignRoleToIdentity(identity, owner);
  }

  @Test
  void the_owner_is_made_under_the_lock_in_a_transaction_of_its_own() {
    activeOwner(true);

    bootstrap.run(null);

    verify(jdbc).sql(contains("pg_advisory_xact_lock"));
    ArgumentCaptor<TransactionDefinition> definition =
        ArgumentCaptor.forClass(TransactionDefinition.class);
    verify(transactions).getTransaction(definition.capture());
    assertThat(definition.getValue().getPropagationBehavior())
        .isEqualTo(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
  }

  @Test
  void a_taken_address_while_an_owner_appeared_is_fine() {
    activeOwner(false, true);
    whoCreates();
    when(emails.register(identity, EMAIL)).thenThrow(new EmailAddressTakenException());

    assertThatCode(() -> bootstrap.run(null)).doesNotThrowAnyException();
  }

  @Test
  void a_taken_address_with_no_active_owner_names_the_setting() {
    activeOwner(false, false);
    whoCreates();
    when(emails.register(identity, EMAIL)).thenThrow(new EmailAddressTakenException());

    assertThatIllegalStateException()
        .isThrownBy(() -> bootstrap.run(null))
        .withMessageContaining("roux.owner.email (" + EMAIL + ")");
  }
}
