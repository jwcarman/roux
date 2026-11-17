package org.jwcarman.roux.examples.dojo.members;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.jwcarman.roux.examples.dojo.identity.AppRoles;
import org.jwcarman.who.spring.security.RequiresPermission;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/members/invitations")
public class InvitationsController {

  private final InvitationService invitations;

  public InvitationsController(InvitationService invitations) {
    this.invitations = invitations;
  }

  @PostMapping
  @ResponseStatus(HttpStatus.ACCEPTED)
  @RequiresPermission(AppRoles.MEMBERS_INVITE)
  public InvitationResult invite(@Valid @RequestBody Invitation request) {
    return new InvitationResult(
        invitations.invite(request.name(), request.email(), request.role()));
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
  public record Invitation(
      @NotBlank @Size(max = MemberProfile.MAX_NAME) String name,
      @NotBlank @Email String email,
      InvitableRole role) {
    public Invitation {
      name = name == null ? null : name.strip();
      email = email == null ? null : email.strip();
      role = role == null ? InvitableRole.MEMBER : role;
    }
  }
}
