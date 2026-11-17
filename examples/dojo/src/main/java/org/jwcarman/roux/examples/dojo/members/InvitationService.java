package org.jwcarman.roux.examples.dojo.members;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import org.jwcarman.roux.examples.dojo.activity.ActivityLog;
import org.jwcarman.roux.problems.InvalidFieldException;
import org.jwcarman.who.core.crypto.Secrets;
import org.jwcarman.who.core.domain.Identity;
import org.jwcarman.who.core.service.WhoService;
import org.jwcarman.who.emaillink.EmailAddressTakenException;
import org.jwcarman.who.emaillink.EmailCredential;
import org.jwcarman.who.emaillink.EmailCredentialService;
import org.jwcarman.who.emaillink.EmailLinkIssuer;
import org.jwcarman.who.emaillink.EmailLinkOutcome;
import org.jwcarman.who.rbac.RbacService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.validation.annotation.Validated;

/**
 * Invites a member: an identity with the role invited and an email credential, then a who sign-in
 * link. Accepting the invitation is signing in.
 */
@Service
@Validated
public class InvitationService {

  private static final Logger log = LoggerFactory.getLogger(InvitationService.class);

  private final WhoService who;
  private final RbacService rbac;
  private final EmailCredentialService emailCredentials;
  private final EmailLinkIssuer linkIssuer;
  private final MemberProfileRepository profiles;
  private final ActivityLog activityLog;
  private final TransactionTemplate registration;
  private final TransactionTemplate linkTransaction;

  public InvitationService(
      WhoService who,
      RbacService rbac,
      EmailCredentialService emailCredentials,
      EmailLinkIssuer linkIssuer,
      MemberProfileRepository profiles,
      ActivityLog activityLog,
      PlatformTransactionManager transactionManager) {
    this.who = who;
    this.rbac = rbac;
    this.emailCredentials = emailCredentials;
    this.linkIssuer = linkIssuer;
    this.profiles = profiles;
    this.activityLog = activityLog;
    this.registration = new TransactionTemplate(transactionManager);
    // The issuer writes the link's token: in a transaction of its own, after the member's has
    // committed, so a link is only ever sent for a member who exists.
    this.linkTransaction = new TransactionTemplate(transactionManager);
    this.linkTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
  }

  /**
   * Invites the address, with {@code role}, as a member named {@code name}: creates the member and
   * the profile, commits, then sends the sign-in link. The member is invited even when the link
   * cannot be sent (they can sign in from the sign-in page), so the answer says whether it was.
   *
   * @return whether the sign-in link was sent
   * @throws InvalidFieldException on {@code email} if the address is already registered
   */
  public boolean invite(
      @NotBlank @Size(max = MemberProfile.MAX_NAME) String name,
      @NotBlank @Email String email,
      @NotNull InvitableRole role) {
    registration.executeWithoutResult(_ -> register(name, email, role));
    EmailLinkOutcome outcome =
        linkTransaction.execute(_ -> linkIssuer.issue(email, Secrets.token()));
    if (outcome != EmailLinkOutcome.SENT) {
      log.warn("Invitation link not sent: {}", outcome);
      return false;
    }
    return true;
  }

  private void register(String name, String email, InvitableRole role) {
    // findByAddress normalizes the way who does, so any spelling of a known address matches.
    if (emailCredentials.findByAddress(email).isPresent()) {
      throw new InvalidFieldException("email", "That address is already a member");
    }
    Identity identity = who.createIdentity();
    rbac.assignRoleToIdentity(identity, rbac.findRequiredRole(role.role()));
    EmailCredential credential;
    try {
      credential = emailCredentials.register(identity, email);
    } catch (EmailAddressTakenException _) {
      throw new InvalidFieldException("email", "That address is already a member");
    }
    MemberProfile profile =
        profiles.save(new MemberProfile(identity.id(), name, credential.address()));
    activityLog.record(
        MemberActivity.SUBJECT,
        identity.id(),
        MemberActivity.INVITED,
        "Invited " + profile.getDisplayName());
  }
}
