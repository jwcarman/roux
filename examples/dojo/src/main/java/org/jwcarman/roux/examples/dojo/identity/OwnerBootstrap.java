package org.jwcarman.roux.examples.dojo.identity;

import org.jwcarman.roux.examples.dojo.identity.AppRoles.AppRole;
import org.jwcarman.roux.examples.dojo.members.MemberProfile;
import org.jwcarman.roux.examples.dojo.members.MemberProfileRepository;
import org.jwcarman.who.core.domain.Identity;
import org.jwcarman.who.core.service.WhoService;
import org.jwcarman.who.emaillink.EmailAddressTakenException;
import org.jwcarman.who.emaillink.EmailCredential;
import org.jwcarman.who.emaillink.EmailCredentialService;
import org.jwcarman.who.rbac.RbacService;
import org.jwcarman.who.rbac.Role;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Creates the roles and, while no identity holds OWNER, an owner for {@code app.owner-email}. Once
 * an owner exists, a different {@code app.owner-email} changes nothing (owners are managed in the
 * app, not by restarting it); if every owner is deleted, the next start creates one again. An
 * address another identity holds is left alone. An advisory lock serializes concurrent starts.
 */
@Component
public class OwnerBootstrap implements ApplicationRunner {

  private static final Logger log = LoggerFactory.getLogger(OwnerBootstrap.class);

  private static final long LOCK_KEY = 0x6e6f6972_6f776e65L;

  private final JdbcTemplate jdbc;
  private final RbacService rbac;
  private final WhoService who;
  private final EmailCredentialService emailCredentials;
  private final AppProperties properties;
  private final MemberProfileRepository profiles;
  private final TransactionTemplate tx;

  public OwnerBootstrap(
      JdbcTemplate jdbc,
      RbacService rbac,
      WhoService who,
      EmailCredentialService emailCredentials,
      AppProperties properties,
      MemberProfileRepository profiles,
      PlatformTransactionManager transactionManager) {
    this.jdbc = jdbc;
    this.rbac = rbac;
    this.who = who;
    this.emailCredentials = emailCredentials;
    this.properties = properties;
    this.profiles = profiles;
    // Transactions of its own, even under a caller's: who's register marks the transaction it
    // joins rollback-only when it refuses the address, which must not fail the caller's commit.
    this.tx = new TransactionTemplate(transactionManager);
    this.tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
  }

  /**
   * Creates the roles, then the owner, in two transactions that each hold the bootstrap lock, so
   * concurrent first starts run one after the other. The owner's transaction is speculative: who
   * decides whether the address is free (register reclaims an address a deleted identity left
   * behind, and refuses one another identity holds). When it refuses, the owner exists and the
   * transaction rolls back with the speculative identity. Two transactions, not a savepoint inside
   * one: JPA's transaction manager cannot use savepoints.
   */
  @Override
  public void run(ApplicationArguments args) {
    tx.executeWithoutResult(
        _ -> {
          lock();
          // Every listed permission, on new and existing roles alike, so a permission added in
          // a later release reaches a database made before it (adding one twice is harmless).
          for (AppRole appRole : AppRole.values()) {
            Role role = rbac.findRole(appRole).orElseGet(() -> rbac.createRole(appRole));
            appRole.permissions().forEach(permission -> rbac.addPermissionToRole(role, permission));
          }
        });
    try {
      tx.executeWithoutResult(
          _ -> {
            lock();
            if (ownerExists()) {
              if (emailCredentials.findByAddress(properties.ownerEmail()).isEmpty()) {
                log.info("An owner exists, so app.owner-email, which no one holds, creates none");
              }
              return;
            }
            Identity owner = who.createIdentity();
            rbac.assignRoleToIdentity(owner, rbac.findRequiredRole(AppRole.OWNER));
            EmailCredential credential = emailCredentials.register(owner, properties.ownerEmail());
            profiles.save(
                new MemberProfile(owner.id(), properties.ownerName(), credential.address()));
          });
    } catch (EmailAddressTakenException _) {
      // The owner exists; the rollback removed the speculative identity.
    }
  }

  /** Serializes concurrent first starts; the lock is released when the transaction ends. */
  private void lock() {
    jdbc.queryForObject("select pg_advisory_xact_lock(?)", Object.class, LOCK_KEY);
  }

  /** Whether any identity holds OWNER: who's tables, as the members view reads them. */
  private boolean ownerExists() {
    return Boolean.TRUE.equals(
        jdbc.queryForObject(
            "select exists (select 1 from who_identity_role ir join who_role r on r.id = ir.role_id"
                + " where r.name = ?)",
            Boolean.class,
            AppRole.OWNER.name()));
  }
}
