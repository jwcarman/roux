package org.jwcarman.roux.examples.dojo.members;

import java.util.Arrays;
import java.util.Set;
import java.util.function.Supplier;
import java.util.stream.Collectors;

import org.jwcarman.roux.examples.dojo.activity.ActivityLog;
import org.jwcarman.who.emaillink.IdentityInvited;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Creates the member's profile row when who invites an identity. who publishes {@link
 * IdentityInvited} inside the invitation's transaction and this is a plain listener, so a failure
 * here rolls the invitation back and no email goes out.
 *
 * <p>The invitation carries no name. {@link InviteController} hands the form's name over with
 * {@link #named}, for the one invitation running on its thread; an invitation made any other way
 * (who's own {@code POST /who/invitations}) gets the part of the address before the {@code @} until
 * the member renames themselves.
 */
@Component
public class MemberProfileOnInvite {

  private static final ScopedValue<String> NAME = ScopedValue.newInstance();

  private static final Set<String> INVITABLE =
      Arrays.stream(InvitableRole.values())
          .map(role -> role.role().name())
          .collect(Collectors.toUnmodifiableSet());

  private final MemberProfileRepository profiles;
  private final ActivityLog activityLog;

  public MemberProfileOnInvite(MemberProfileRepository profiles, ActivityLog activityLog) {
    this.profiles = profiles;
    this.activityLog = activityLog;
  }

  /** Runs {@code invitation} with {@code name} as the display name of the member it invites. */
  static <T> T named(String name, Supplier<T> invitation) {
    return ScopedValue.where(NAME, name).call(invitation::get);
  }

  /**
   * Creates the profile.
   *
   * @throws IllegalStateException if the invitation gives a role an invitation may not, which rolls
   *     it back: an invitation never makes an owner, whoever sends it
   */
  @EventListener
  void on(IdentityInvited event) {
    if (!INVITABLE.containsAll(event.roles())) {
      throw new IllegalStateException("An invitation may only give " + INVITABLE);
    }
    String name = NAME.isBound() ? NAME.get() : localPart(event.address());
    MemberProfile profile =
        profiles.save(new MemberProfile(event.identityId(), name, event.address()));
    activityLog.record(
        MemberActivity.SUBJECT,
        event.identityId(),
        MemberActivity.INVITED,
        "Invited " + profile.getDisplayName());
  }

  private static String localPart(String address) {
    String local = address.substring(0, address.indexOf('@'));
    return local.length() > MemberProfile.MAX_NAME
        ? local.substring(0, MemberProfile.MAX_NAME)
        : local;
  }
}
