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

import org.jwcarman.who.emaillink.IdentityInvited;
import org.jwcarman.who.emaillink.InvalidInvitationException;
import org.springframework.context.event.EventListener;

/**
 * The backstop on who's invitations: an invitation gives only {@link InvitableRoles}, whichever
 * endpoint sends it (the app's own, or who's {@code POST /who/invitations}). who publishes {@link
 * IdentityInvited} inside the invitation's transaction, so a refusal rolls the invitation back and
 * no email goes out.
 */
public class InvitableRolesGuard {

  private final InvitableRoles invitable;

  /**
   * Creates the guard.
   *
   * @param invitable the roles an invitation may give
   */
  public InvitableRolesGuard(InvitableRoles invitable) {
    this.invitable = invitable;
  }

  /**
   * Checks the invitation's roles.
   *
   * @param event the invitation
   * @throws InvalidInvitationException if it gives a role an invitation may not (who answers it as
   *     a 400 with code {@code invalid-request})
   */
  @EventListener
  public void on(IdentityInvited event) {
    if (!invitable.names().containsAll(event.roles())) {
      throw new InvalidInvitationException("An invitation may only give " + invitable.names());
    }
  }
}
