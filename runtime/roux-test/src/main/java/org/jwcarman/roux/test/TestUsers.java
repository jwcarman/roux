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

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.jwcarman.roux.roles.OwnerBootstrap;
import org.jwcarman.roux.roles.UserJoined;
import org.jwcarman.who.core.domain.Identity;
import org.jwcarman.who.core.service.WhoService;
import org.jwcarman.who.emaillink.EmailCredential;
import org.jwcarman.who.emaillink.EmailCredentialService;
import org.jwcarman.who.rbac.RbacService;
import org.jwcarman.who.rbac.Role;
import org.jwcarman.who.test.WhoMockMvcBrowser;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Users for an {@link AppTest}: a clean slate, and people signed in with a role. A person is made
 * as a real user is: who's identity, address and role, and {@link UserJoined} in the same
 * transaction, so the app's listener makes its own data for them.
 */
public class TestUsers {

  /** The owner's address, which the app makes the owner at startup and on every reset. */
  public static final String OWNER_EMAIL = "owner@example.com";

  /** who's tables; truncating them (cascading to what refers to them) removes every user. */
  private static final List<String> WHO_TABLES =
      List.of("who_identity", "who_email_credential", "who_credential_identity");

  private final JdbcTemplate jdbc;
  private final OwnerBootstrap bootstrap;
  private final TestClock clock;
  private final MockMvc mvc;
  private final WhoService who;
  private final RbacService rbac;
  private final EmailCredentialService emailCredentials;
  private final ApplicationEventPublisher events;
  private final TransactionTemplate tx;
  private final String[] startupRoles;

  /**
   * Creates the users, remembering the roles that exist now (from the changelogs) as the ones
   * {@link #reset(String...)} keeps.
   *
   * @param jdbc empties tables and reads roles
   * @param bootstrap makes the owner again on reset
   * @param clock put back on real time on reset
   * @param mvc the app, for signed-in browsers
   * @param who creates identities
   * @param rbac finds and assigns roles
   * @param emailCredentials registers addresses
   * @param events publishes {@link UserJoined}
   * @param transactionManager runs each new user's transaction
   */
  public TestUsers(
      JdbcTemplate jdbc,
      OwnerBootstrap bootstrap,
      TestClock clock,
      MockMvc mvc,
      WhoService who,
      RbacService rbac,
      EmailCredentialService emailCredentials,
      ApplicationEventPublisher events,
      PlatformTransactionManager transactionManager) {
    this.jdbc = jdbc;
    this.bootstrap = bootstrap;
    this.clock = clock;
    this.mvc = mvc;
    this.who = who;
    this.rbac = rbac;
    this.emailCredentials = emailCredentials;
    this.events = events;
    this.tx = new TransactionTemplate(transactionManager);
    this.startupRoles =
        jdbc.queryForList("select name from who_role", String.class).toArray(String[]::new);
  }

  /**
   * Starts a test from a clean slate: removes every user and empties {@code appTables}, deletes the
   * roles tests made, makes the owner again as roux does at startup, and puts the clock back on
   * real time.
   *
   * @param appTables the app's tables to empty as well (cascading to what refers to them)
   */
  public void reset(String... appTables) {
    List<String> truncated = new ArrayList<>(WHO_TABLES);
    truncated.addAll(List.of(appTables));
    jdbc.execute("truncate " + String.join(", ", truncated) + " cascade");
    jdbc.update("delete from who_role where name <> all (?)", (Object) startupRoles);
    clock.useRealTime();
    bootstrap.run(null);
  }

  /**
   * A new user with {@code role}, signed in.
   *
   * @param name the user's display name, as {@link UserJoined} carries it
   * @param email the user's address
   * @param role the name of one of the app's roles
   * @return the user and their browser
   * @throws IllegalArgumentException when no role has that name, listing the roles there are
   */
  public TestUser signedIn(String name, String email, String role) {
    List<String> roles = jdbc.queryForList("select name from who_role order by name", String.class);
    if (!roles.contains(role)) {
      throw new IllegalArgumentException("No role named " + role + "; the roles are " + roles);
    }
    return signedIn(name, email, rbac.findRequiredRole(role));
  }

  /**
   * A new user with {@code role}, which need not be one of the app's, signed in. Everything is made
   * in one transaction: an address already registered, or a listener that throws, leaves no one
   * behind.
   *
   * @param name the user's display name, as {@link UserJoined} carries it
   * @param email the user's address
   * @param role the role to assign
   * @return the user and their browser
   */
  public TestUser signedIn(String name, String email, Role role) {
    EmailCredential[] credential = new EmailCredential[1];
    Identity identity =
        tx.execute(
            _ -> {
              Identity created = who.createIdentity();
              credential[0] = emailCredentials.register(created, email);
              rbac.assignRoleToIdentity(created, role);
              events.publishEvent(
                  new UserJoined(created.id(), name, credential[0].address(), role.name()));
              return created;
            });
    return new TestUser(identity.id(), browserFor(identity.id(), credential[0]));
  }

  /**
   * The owner the app made from {@link #OWNER_EMAIL}, signed in.
   *
   * @return the owner and their browser
   */
  public TestUser owner() {
    EmailCredential credential = emailCredentials.findByAddress(OWNER_EMAIL).orElseThrow();
    UUID id = who.resolve(credential::id).orElseThrow().identity().id();
    return new TestUser(id, browserFor(id, credential));
  }

  /**
   * A browser with no one signed in.
   *
   * @return the browser
   */
  public WhoMockMvcBrowser anonymous() {
    return new WhoMockMvcBrowser(mvc);
  }

  private WhoMockMvcBrowser browserFor(UUID id, EmailCredential credential) {
    return new WhoMockMvcBrowser(mvc).signedInAs(id, credential.id());
  }
}
