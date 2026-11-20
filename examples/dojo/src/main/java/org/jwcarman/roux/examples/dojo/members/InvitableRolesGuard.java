package org.jwcarman.roux.examples.dojo.members;

import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

import org.jwcarman.who.emaillink.IdentityInvited;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * The backstop on who's invitations: an invitation never makes an owner, whoever sends it. who
 * applies no policy of its own, so anyone with who's own {@code POST /who/invitations} permission
 * could invite one; {@link InviteController} checks the roles in its request, and this listener
 * checks every invitation. who publishes {@link IdentityInvited} inside the invitation's
 * transaction, so a refusal here rolls the invitation back and no email goes out.
 */
@Component
public class InvitableRolesGuard {

  private static final Set<String> INVITABLE =
      Arrays.stream(InvitableRole.values())
          .map(role -> role.role())
          .collect(Collectors.toUnmodifiableSet());

  /**
   * Checks the invitation's roles.
   *
   * @throws IllegalStateException if the invitation gives a role an invitation may not
   */
  @EventListener
  void on(IdentityInvited event) {
    if (!INVITABLE.containsAll(event.roles())) {
      throw new IllegalStateException("An invitation may only give " + INVITABLE);
    }
  }
}
