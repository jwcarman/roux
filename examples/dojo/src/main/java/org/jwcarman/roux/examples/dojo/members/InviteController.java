package org.jwcarman.roux.examples.dojo.members;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.jwcarman.roux.activity.ActivityLog;
import org.jwcarman.roux.examples.dojo.identity.Permissions;
import org.jwcarman.roux.examples.dojo.identity.Roles;
import org.jwcarman.roux.problems.InvalidFieldException;
import org.jwcarman.roux.roles.InvitableRoles;
import org.jwcarman.roux.roles.UserInvitations;
import org.jwcarman.who.core.domain.Identity;
import org.jwcarman.who.emaillink.EmailAddressTakenException;
import org.jwcarman.who.emaillink.Invitation;
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
 * The invite form's endpoint: the dojo's rules (a name, and only the roles in {@code
 * roux.roles.invitable}) in front of roux's {@link UserInvitations}. The member's profile comes
 * from {@link MemberProfiles}, which hears {@code UserJoined}; the "invited" activity entry is
 * written in the same transaction, so both commit or roll back with the invitation. roux's guard
 * refuses any other role for invitations made any other way.
 */
@RestController
@RequestMapping("/api/members/invitations")
public class InviteController {

  private static final Logger log = LoggerFactory.getLogger(InviteController.class);

  private final UserInvitations invitations;
  private final MemberProfileRepository profiles;
  private final ActivityLog activityLog;
  private final InvitableRoles invitable;

  public InviteController(
      UserInvitations invitations,
      MemberProfileRepository profiles,
      ActivityLog activityLog,
      InvitableRoles invitable) {
    this.invitations = invitations;
    this.profiles = profiles;
    this.activityLog = activityLog;
    this.invitable = invitable;
  }

  /**
   * Invites the address. The member is invited even when the link cannot be sent (they can sign in
   * from the sign-in page), so the answer says whether it was. Runs outside any transaction, as who
   * requires.
   *
   * @throws InvalidFieldException on {@code role} if an invitation may not give it, or on {@code
   *     email} if the address is already registered
   */
  @PostMapping
  @ResponseStatus(HttpStatus.ACCEPTED)
  @RequiresPermission(Permissions.MEMBERS_INVITE)
  public InvitationResult invite(@Valid @RequestBody InvitationRequest request) {
    if (!invitable.contains(request.role())) {
      throw new InvalidFieldException("role", "An invitation cannot give that role");
    }
    Invitation invitation;
    try {
      invitation =
          invitations.invite(request.name(), request.email(), request.role(), this::appendInvited);
    } catch (EmailAddressTakenException _) {
      throw new InvalidFieldException("email", "That address is already a member");
    }
    if (!invitation.linkSent()) {
      log.warn("Invitation link not sent: {}", invitation.linkOutcome());
    }
    return new InvitationResult(invitation.linkSent());
  }

  /**
   * Runs inside who's invitation transaction, on this thread: the profile and the activity entry
   * join it (no new transaction), and any exception rolls the invitation back and sends nothing.
   * The identity carries no address, so the profile's comes from the request, normalized as who
   * registers it.
   */
  private void appendInvited(Identity identity) {
    String name = profiles.findById(identity.id()).orElseThrow().getDisplayName();
    activityLog.append(identity.id(), new MemberInvited(name));
  }

  /**
   * The member is invited either way; {@code linkSent} is false when the sign-in link could not be
   * emailed, so the inviter can tell them to sign in from the sign-in page.
   */
  public record InvitationResult(boolean linkSent) {}

  /**
   * The name and address are trimmed before they are checked; who normalizes the address further.
   * No role means {@link Roles#MEMBER}; a role an invitation may not give is a 400 on {@code role}.
   */
  public record InvitationRequest(
      @NotBlank @Size(max = MemberProfile.MAX_NAME) String name,
      @NotBlank @Email String email,
      String role) {
    public InvitationRequest {
      name = name == null ? null : name.strip();
      email = email == null ? null : email.strip();
      role = role == null ? Roles.MEMBER : role;
    }
  }
}
