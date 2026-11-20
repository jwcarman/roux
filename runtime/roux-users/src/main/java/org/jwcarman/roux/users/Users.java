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
package org.jwcarman.roux.users;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

import org.jwcarman.jpa.pagination.PageDto;
import org.jwcarman.jpa.pagination.PageSpec;
import org.jwcarman.jpa.spring.page.Paginator;
import org.jwcarman.roux.activity.Activity;
import org.jwcarman.roux.activity.ActivityLog;
import org.jwcarman.roux.jpa.Versions;
import org.jwcarman.roux.problems.ConflictException;
import org.jwcarman.roux.problems.InvalidFieldException;
import org.jwcarman.roux.problems.InvariantViolationException;
import org.jwcarman.roux.roles.InvitableRoles;
import org.jwcarman.roux.roles.RouxRoles;
import org.jwcarman.roux.roles.UserInvitations;
import org.jwcarman.who.admin.LastAdminException;
import org.jwcarman.who.admin.LastAdminGuard;
import org.jwcarman.who.core.domain.Identity;
import org.jwcarman.who.core.domain.IdentityStatus;
import org.jwcarman.who.core.repository.IdentityRepository;
import org.jwcarman.who.core.service.WhoService;
import org.jwcarman.who.core.service.WhoSessions;
import org.jwcarman.who.emaillink.EmailAddressTakenException;
import org.jwcarman.who.emaillink.EmailLinkOutcome;
import org.jwcarman.who.emaillink.Invitation;
import org.jwcarman.who.rbac.RbacService;
import org.jwcarman.who.rbac.Role;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * The app's users: reading them, inviting them and managing them, with every change recorded in the
 * activity log against the user. One role per user, chosen from the invitable roles; the last
 * person who can manage people stays (who-admin's {@link LastAdminGuard}). Status and role changes
 * take one database lock, so two at once cannot both pass their checks.
 */
@Transactional
public class Users {

  /** The advisory lock status and role changes take, for the length of their transaction. */
  static final long CHANGE_LOCK = 0x726f7578_75736572L;

  private static final Paginator PAGES =
      Paginator.of(UserDirectoryEntry.class, UserSort.class, cfg -> cfg.defaultSort(UserSort.NAME));

  private final AppUserRepository users;
  private final UserDirectory directory;
  private final ActivityLog activityLog;
  private final UserInvitations invitations;
  private final InvitableRoles invitable;
  private final Who who;

  /**
   * who's services the users are managed through.
   *
   * @param service activates and deactivates identities
   * @param identities finds identities
   * @param rbac reads and changes roles
   * @param sessions ends sessions
   * @param lastAdmin keeps someone who can manage people
   * @param jdbc takes the change lock
   */
  public record Who(
      WhoService service,
      IdentityRepository identities,
      RbacService rbac,
      WhoSessions sessions,
      LastAdminGuard lastAdmin,
      JdbcClient jdbc) {}

  /**
   * Creates the service.
   *
   * @param users the users' names
   * @param directory the users as the app shows them
   * @param activityLog where changes are recorded
   * @param invitations invites by name
   * @param invitable the roles a user may be given
   * @param who who's services
   */
  public Users(
      AppUserRepository users,
      UserDirectory directory,
      ActivityLog activityLog,
      UserInvitations invitations,
      InvitableRoles invitable,
      Who who) {
    this.users = users;
    this.directory = directory;
    this.activityLog = activityLog;
    this.invitations = invitations;
    this.invitable = invitable;
    this.who = who;
  }

  /**
   * The signed-in user.
   *
   * @param id their identity's id
   * @return how they see themselves
   * @throws UserNotFoundException if they are not a user
   */
  @Transactional(readOnly = true)
  public Me me(UUID id) {
    return Me.of(entry(id));
  }

  /**
   * Renames the signed-in user.
   *
   * @param id their identity's id
   * @param displayName the new name
   * @param version the version they read
   * @return how they see themselves now
   * @throws UserNotFoundException if they are not a user
   */
  public Me renameMe(UUID id, String displayName, Long version) {
    renamed(id, displayName, version);
    return Me.of(entry(id));
  }

  /**
   * A page of users.
   *
   * @param spec the page and its sort ({@link UserSort})
   * @param filter which users
   * @return the page
   * @throws InvalidFieldException on {@code role} if no role has that name
   */
  @Transactional(readOnly = true)
  public PageDto<UserRow> list(PageSpec spec, UserFilter filter) {
    if (filter.role() != null && who.rbac().findRole(filter.role()).isEmpty()) {
      throw new InvalidFieldException("role", "No such role");
    }
    return PAGES.paginate(
        spec, pageable -> directory.findAll(filter.specification(), pageable), UserRow::of);
  }

  /**
   * One user.
   *
   * @param id their identity's id
   * @return their detail
   * @throws UserNotFoundException if there is no such user
   */
  @Transactional(readOnly = true)
  public UserDetail detail(UUID id) {
    return UserDetail.of(entry(id));
  }

  /**
   * A user's history, newest first.
   *
   * @param id their identity's id
   * @param spec the page
   * @return the page
   * @throws UserNotFoundException if there is no such user
   */
  @Transactional(readOnly = true)
  public PageDto<Activity> activities(UUID id, PageSpec spec) {
    user(id);
    return activityLog.history(id, spec);
  }

  /**
   * Invites someone, recording it against them in the invitation's transaction. Runs with no
   * transaction of its own, as who's invitations must.
   *
   * @param name their display name
   * @param email their address
   * @param role the role to give them
   * @return the invitation
   * @throws InvalidFieldException on {@code role} if it is not invitable, or on {@code email} if
   *     the address already belongs to someone
   */
  @Transactional(propagation = Propagation.NOT_SUPPORTED)
  public Invitation invite(String name, String email, String role) {
    requireInvitable(role);
    try {
      return invitations.invite(
          name, email, role, identity -> activityLog.append(identity.id(), new UserInvited(name)));
    } catch (EmailAddressTakenException _) {
      throw new InvalidFieldException("email", "That address already belongs to a user");
    }
  }

  /**
   * Sends the invitation again to someone who has never signed in. Runs with no transaction of its
   * own, as who's invitations must.
   *
   * @param id their identity's id
   * @return whether the link went out; not when it is too soon after the last
   * @throws UserNotFoundException if there is no such user
   * @throws ConflictException if they have signed in
   */
  @Transactional(propagation = Propagation.NOT_SUPPORTED)
  public boolean resendInvitation(UUID id) {
    if (!entry(id).isInvited()) {
      throw new ConflictException("Already signed in");
    }
    return invitations.resend(id) == EmailLinkOutcome.SENT;
  }

  /**
   * Renames a user.
   *
   * @param id their identity's id
   * @param displayName the new name
   * @param version the version the caller read
   * @return their detail now
   * @throws UserNotFoundException if there is no such user
   */
  public UserDetail rename(UUID id, String displayName, Long version) {
    renamed(id, displayName, version);
    return detail(id);
  }

  /**
   * Gives a user a new role, in place of every role they hold.
   *
   * @param id their identity's id
   * @param role the role's name; one of the invitable roles
   * @return their detail now
   * @throws UserNotFoundException if there is no such user
   * @throws InvalidFieldException on {@code role} if it is not invitable
   * @throws LastAdminException if it would leave no one who can manage people
   */
  public UserDetail changeRole(UUID id, String role) {
    lock();
    Identity identity = identity(id);
    requireInvitable(role);
    return giveOnly(identity, role);
  }

  /**
   * Makes an existing user an owner, in place of their role. The endpoint asks for {@code
   * users.owners} and a recent sign-in; invitations and {@link #changeRole} never give {@code
   * OWNER}.
   *
   * @param id their identity's id
   * @return their detail now
   * @throws UserNotFoundException if there is no such user
   */
  public UserDetail makeOwner(UUID id) {
    lock();
    return giveOnly(identity(id), RouxRoles.OWNER);
  }

  private UserDetail giveOnly(Identity identity, String role) {
    UUID id = identity.id();
    List<Role> current = who.rbac().findRolesForIdentity(id);
    if (current.size() == 1 && current.getFirst().name().equals(role)) {
      return detail(id);
    }
    Role chosen = who.rbac().findRequiredRole(role);
    for (Role old : current) {
      if (!old.equals(chosen)) {
        who.lastAdmin()
            .removeRole(
                id,
                old.id(),
                () -> {
                  who.rbac().removeRoleFromIdentity(identity, old);
                  return Boolean.TRUE;
                });
      }
    }
    if (!current.contains(chosen)) {
      who.rbac().assignRoleToIdentity(identity, chosen);
    }
    String from = current.stream().map(Role::name).sorted().collect(Collectors.joining(", "));
    activityLog.append(id, new UserRoleChanged(from, role));
    return detail(id);
  }

  /**
   * Deactivates a user: who stops letting them sign in, and ends their sessions on their next
   * request.
   *
   * @param actorId who is asking
   * @param id the user's identity's id
   * @return their detail now
   * @throws UserNotFoundException if there is no such user
   * @throws InvariantViolationException if the actor is deactivating themselves
   * @throws ConflictException if the user is already deactivated
   * @throws LastAdminException if it would leave no one who can manage people
   */
  public UserDetail deactivate(UUID actorId, UUID id) {
    lock();
    Identity identity = identity(id);
    if (id.equals(actorId)) {
      throw new InvariantViolationException("You cannot deactivate yourself");
    }
    if (identity.status() != IdentityStatus.ACTIVE) {
      throw new ConflictException("Already deactivated");
    }
    who.lastAdmin()
        .deactivate(
            id,
            () -> {
              who.service().deactivate(id);
              activityLog.append(id, new UserDeactivated());
              return Boolean.TRUE;
            });
    return detail(id);
  }

  /**
   * Reactivates a user.
   *
   * @param id their identity's id
   * @return their detail now
   * @throws UserNotFoundException if there is no such user
   * @throws ConflictException if the user is active
   */
  public UserDetail reactivate(UUID id) {
    lock();
    Identity identity = identity(id);
    if (identity.status() == IdentityStatus.ACTIVE) {
      throw new ConflictException("Already active");
    }
    who.service().reactivate(id);
    activityLog.append(id, new UserReactivated());
    return detail(id);
  }

  /**
   * Ends every session a user has, on every device.
   *
   * @param id their identity's id
   * @throws UserNotFoundException if there is no such user
   */
  public void signOutEverywhere(UUID id) {
    user(id);
    who.sessions().endAll(id);
  }

  private void renamed(UUID id, String displayName, Long version) {
    AppUser user = user(id);
    Versions.require(user, version);
    String before = user.getDisplayName();
    user.rename(displayName);
    if (!user.getDisplayName().equals(before)) {
      activityLog.append(id, new UserRenamed(before, user.getDisplayName()));
    }
    users.saveAndFlush(user);
  }

  private void requireInvitable(String role) {
    if (!invitable.contains(role)) {
      throw new InvalidFieldException("role", "That role cannot be given");
    }
  }

  private void lock() {
    who.jdbc().sql("select pg_advisory_xact_lock(?)").param(CHANGE_LOCK).query().singleRow();
  }

  private AppUser user(UUID id) {
    return users.findById(id).orElseThrow(UserNotFoundException::new);
  }

  private Identity identity(UUID id) {
    user(id);
    return who.identities().findById(id).orElseThrow(UserNotFoundException::new);
  }

  private UserDirectoryEntry entry(UUID id) {
    return directory.findById(id).orElseThrow(UserNotFoundException::new);
  }
}
