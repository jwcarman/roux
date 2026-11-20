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

import java.util.Set;
import java.util.UUID;
import java.util.function.Consumer;

import org.jwcarman.who.core.domain.Identity;
import org.jwcarman.who.emaillink.EmailCredential;
import org.jwcarman.who.emaillink.EmailLinkOutcome;
import org.jwcarman.who.emaillink.InvalidInvitationException;
import org.jwcarman.who.emaillink.Invitation;
import org.jwcarman.who.emaillink.InvitationService;
import org.springframework.context.ApplicationEventPublisher;

/**
 * Invites a user by name: who's invitation, with {@link UserJoined} published inside it. The role
 * is checked as every invitation's is ({@link InvitableRolesGuard}); an address already registered
 * is refused as who refuses it ({@code EmailAddressTakenException}).
 */
public class UserInvitations {

  private final InvitationService invitations;
  private final ApplicationEventPublisher events;

  /**
   * Creates the service.
   *
   * @param invitations who's invitations
   * @param events publishes {@link UserJoined}
   */
  public UserInvitations(InvitationService invitations, ApplicationEventPublisher events) {
    this.invitations = invitations;
    this.events = events;
  }

  /**
   * Invites a user.
   *
   * @param name the user's display name
   * @param email the address to invite
   * @param role the role the user gets
   * @return who's invitation: the new identity, and whether the link was sent
   */
  public Invitation invite(String name, String email, String role) {
    return invite(name, email, role, _ -> {});
  }

  /**
   * Invites a user, with the app's other work in the invitation's transaction.
   *
   * @param name the user's display name
   * @param email the address to invite
   * @param role the role the user gets
   * @param alsoInTransaction runs after {@link UserJoined}, in the same transaction (the app's
   *     "Invited" activity); throwing rolls the invitation back
   * @return who's invitation: the new identity, and whether the link was sent
   */
  public Invitation invite(
      String name, String email, String role, Consumer<Identity> alsoInTransaction) {
    String address = EmailCredential.normalize(email);
    return invitations.invite(
        email,
        Set.of(role),
        identity -> {
          events.publishEvent(new UserJoined(identity.id(), name, address, role));
          alsoInTransaction.accept(identity);
        });
  }

  /**
   * Sends someone's invitation again: a new link to their oldest address, replacing the one they
   * have, unless who's resend interval has not passed. It does not check whether they have signed
   * in; who cannot tell.
   *
   * @param identityId the invited identity
   * @return what became of the email; {@link EmailLinkOutcome#RESEND_SUPPRESSED} too soon after the
   *     last
   * @throws InvalidInvitationException if they have no address
   */
  public EmailLinkOutcome resend(UUID identityId) {
    return invitations.resend(identityId);
  }
}
