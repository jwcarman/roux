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

import org.jwcarman.who.core.domain.Identity;
import org.jwcarman.who.core.service.WhoService;
import org.jwcarman.who.emaillink.EmailAddressTakenException;
import org.jwcarman.who.emaillink.EmailCredential;
import org.jwcarman.who.emaillink.EmailCredentialService;
import org.jwcarman.who.rbac.RbacService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Makes the first owner: while no active identity holds {@link RouxRoles#OWNER}, it creates one for
 * {@code roux.owner.email}. Once an active owner exists the settings change nothing; if none is
 * active (the database was changed by hand), the next start makes one again. An advisory lock
 * serializes concurrent starts.
 */
public class OwnerBootstrap implements ApplicationRunner {

  private static final Logger log = LoggerFactory.getLogger(OwnerBootstrap.class);

  private static final long LOCK_KEY = 0x726f7578_6f776e65L;

  private final JdbcClient jdbc;
  private final RbacService rbac;
  private final WhoService who;
  private final EmailCredentialService emailCredentials;
  private final ApplicationEventPublisher events;
  private final TransactionTemplate tx;
  private final String email;
  private final String name;

  /**
   * Creates the bootstrap.
   *
   * @param jdbc takes the lock and finds active owners
   * @param rbac assigns OWNER
   * @param who creates the identity
   * @param emailCredentials registers the owner's address, and decides whether it is free
   * @param events publishes {@link OwnerCreated}
   * @param transactionManager runs the owner's transaction
   * @param email {@code roux.owner.email}
   * @param name {@code roux.owner.name}
   */
  public OwnerBootstrap(
      JdbcClient jdbc,
      RbacService rbac,
      WhoService who,
      EmailCredentialService emailCredentials,
      ApplicationEventPublisher events,
      PlatformTransactionManager transactionManager,
      String email,
      String name) {
    this.jdbc = jdbc;
    this.rbac = rbac;
    this.who = who;
    this.emailCredentials = emailCredentials;
    this.events = events;
    // A transaction of its own, even under a caller's: who's register marks the transaction it
    // joins rollback-only when it refuses the address, which must not fail the caller's commit.
    this.tx = new TransactionTemplate(transactionManager);
    this.tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    this.email = email;
    this.name = name;
  }

  /**
   * Makes the owner, in a transaction that holds the bootstrap lock, so concurrent first starts run
   * one after the other. The transaction is speculative: who decides whether the address is free
   * (register reclaims an address a deleted identity left behind, and refuses one another identity
   * holds). When it refuses, the transaction rolls back with the speculative identity.
   *
   * @param args unused
   * @throws IllegalStateException when no active owner exists and the address belongs to another
   *     identity
   */
  @Override
  public void run(ApplicationArguments args) {
    try {
      tx.executeWithoutResult(
          _ -> {
            lock();
            if (activeOwnerExists()) {
              return;
            }
            Identity owner = who.createIdentity();
            rbac.assignRoleToIdentity(owner, rbac.findRequiredRole(RouxRoles.OWNER));
            EmailCredential credential = emailCredentials.register(owner, email);
            events.publishEvent(new OwnerCreated(owner.id(), name, credential.address()));
            log.info("Created the first OWNER for roux.owner.email");
          });
    } catch (EmailAddressTakenException _) {
      // A concurrent start may have made the owner after this one looked; otherwise the address
      // belongs to someone who is not an active owner, and roux will not take it from them.
      if (!Boolean.TRUE.equals(tx.execute(_ -> activeOwnerExists()))) {
        throw new IllegalStateException(
            "No active OWNER exists and roux.owner.email ("
                + email
                + ") belongs to another identity: set roux.owner.email to a free address");
      }
    }
  }

  /** Serializes concurrent starts; the lock is released when the transaction ends. */
  private void lock() {
    jdbc.sql("select pg_advisory_xact_lock(?)").param(LOCK_KEY).query(Object.class).list();
  }

  private boolean activeOwnerExists() {
    return jdbc.sql(
            "select exists (select 1 from who_identity_role ir join who_role r on r.id ="
                + " ir.role_id join who_identity i on i.id = ir.identity_id where r.name = ? and"
                + " i.status = 'ACTIVE')")
        .param(RouxRoles.OWNER)
        .query(Boolean.class)
        .single();
  }
}
