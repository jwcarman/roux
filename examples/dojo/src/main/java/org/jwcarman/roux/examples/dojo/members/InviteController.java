package org.jwcarman.roux.examples.dojo.members;

import java.util.Set;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.jwcarman.roux.examples.dojo.identity.AppRoles;
import org.jwcarman.roux.problems.InvalidFieldException;
import org.jwcarman.who.emaillink.EmailAddressTakenException;
import org.jwcarman.who.emaillink.Invitation;
import org.jwcarman.who.emaillink.InvitationService;
import org.jwcarman.who.spring.security.RequiresPermission;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The invite form's endpoint: the dojo's rules (a name, and only the roles in {@link
 * InvitableRole}) in front of who's {@link InvitationService}, which does the invitation. The
 * member's profile is created by {@link MemberProfileOnInvite}, inside who's transaction.
 */
@RestController
@RequestMapping("/api/members/invitations")
public class InviteController {

  private static final Logger log = LoggerFactory.getLogger(InviteController.class);

  private final InvitationService invitations;

  public InviteController(InvitationService invitations) {
    this.invitations = invitations;
  }

  /**
   * Invites the address. The member is invited even when the link cannot be sent (they can sign in
   * from the sign-in page), so the answer says whether it was. Runs outside any transaction, as who
   * requires.
   *
   * @throws InvalidFieldException on {@code email} if the address is already registered
   */
  @PostMapping
  @ResponseStatus(HttpStatus.ACCEPTED)
  @RequiresPermission(AppRoles.MEMBERS_INVITE)
  public InvitationResult invite(@Valid @RequestBody InvitationRequest request) {
    Invitation invitation;
    try {
      invitation =
          MemberProfileOnInvite.named(
              request.name(),
              () -> invitations.invite(request.email(), Set.of(request.role().role().name())));
    } catch (EmailAddressTakenException _) {
      throw new InvalidFieldException("email", "That address is already a member");
    }
    if (!invitation.linkSent()) {
      log.warn("Invitation link not sent: {}", invitation.linkOutcome());
    }
    return new InvitationResult(invitation.linkSent());
  }

  /**
   * The member is invited either way; {@code linkSent} is false when the sign-in link could not be
   * emailed, so the inviter can tell them to sign in from the sign-in page.
   */
  public record InvitationResult(boolean linkSent) {}

  /**
   * The name and address are trimmed before they are checked; who normalizes the address further.
   * No role means {@link InvitableRole#MEMBER}; a role outside {@link InvitableRole} is refused
   * when the body is read (400, no field named: Spring's own answer to an enum it does not know).
   */
  public record InvitationRequest(
      @NotBlank @Size(max = MemberProfile.MAX_NAME) String name,
      @NotBlank @Email String email,
      InvitableRole role) {
    public InvitationRequest {
      name = name == null ? null : name.strip();
      email = email == null ? null : email.strip();
      role = role == null ? InvitableRole.MEMBER : role;
    }
  }
}
