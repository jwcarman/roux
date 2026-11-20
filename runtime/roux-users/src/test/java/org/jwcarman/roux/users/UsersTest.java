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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.RETURNS_DEEP_STUBS;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Consumer;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.jwcarman.jpa.pagination.PageDto;
import org.jwcarman.jpa.pagination.PageSpec;
import org.jwcarman.jpa.pagination.SortDirection;
import org.jwcarman.roux.activity.Activity;
import org.jwcarman.roux.activity.ActivityLog;
import org.jwcarman.roux.problems.ConflictException;
import org.jwcarman.roux.problems.InvalidFieldException;
import org.jwcarman.roux.problems.InvariantViolationException;
import org.jwcarman.roux.roles.InvitableRoles;
import org.jwcarman.roux.roles.UserInvitations;
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
import org.mockito.ArgumentCaptor;
import org.mockito.ArgumentMatchers;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

@DisplayNameGeneration(ReplaceUnderscores.class)
class UsersTest {

  record FirstPage() implements PageSpec {
    @Override
    public Integer pageIndex() {
      return 0;
    }

    @Override
    public Integer pageSize() {
      return 20;
    }

    @Override
    public String sortBy() {
      return null;
    }

    @Override
    public SortDirection sortDirection() {
      return null;
    }
  }

  private static final Instant JOINED = Instant.parse("2026-11-20T15:00:00Z");

  private final AppUserRepository users = mock(AppUserRepository.class);
  private final UserDirectory directory = mock(UserDirectory.class);
  private final ActivityLog activityLog = mock(ActivityLog.class);
  private final UserInvitations invitations = mock(UserInvitations.class);
  private final WhoService whoService = mock(WhoService.class);
  private final IdentityRepository identities = mock(IdentityRepository.class);
  private final RbacService rbac = mock(RbacService.class);
  private final WhoSessions sessions = mock(WhoSessions.class);
  private final LastAdminGuard lastAdmin = mock(LastAdminGuard.class);
  private final JdbcClient jdbc = mock(JdbcClient.class, RETURNS_DEEP_STUBS);

  private final Users service =
      new Users(
          users,
          directory,
          activityLog,
          invitations,
          new InvitableRoles(List.of("MEMBER", "INSTRUCTOR")),
          new Users.Who(whoService, identities, rbac, sessions, lastAdmin, jdbc));

  private final UUID ada = UUID.randomUUID();
  private final UUID owner = UUID.randomUUID();
  private final Role member = new Role(UUID.randomUUID(), "MEMBER");
  private final Role instructor = new Role(UUID.randomUUID(), "INSTRUCTOR");
  private AppUser adaUser;

  private UserDirectoryEntry entry(String name, long version) {
    UserDirectoryEntry entry = mock(UserDirectoryEntry.class);
    when(entry.getId()).thenReturn(ada);
    when(entry.getDisplayName()).thenReturn(name);
    when(entry.getEmail()).thenReturn("ada@example.org");
    when(entry.getRole()).thenReturn("MEMBER");
    when(entry.getStatus()).thenReturn("ACTIVE");
    when(entry.getJoinedAt()).thenReturn(JOINED);
    when(entry.isInvited()).thenReturn(true);
    when(entry.getVersion()).thenReturn(version);
    return entry;
  }

  private void adaIs(IdentityStatus status) {
    when(identities.findById(ada))
        .thenReturn(Optional.of(new Identity(ada, status, JOINED, JOINED)));
  }

  @BeforeEach
  void adaIsAUser() {
    adaUser = spy(new AppUser(ada, "Ada Lovelace"));
    doReturn(0L).when(adaUser).getVersion();
    when(users.findById(ada)).thenReturn(Optional.of(adaUser));
    UserDirectoryEntry entry = entry("Ada Lovelace", 0);
    when(directory.findById(ada)).thenReturn(Optional.of(entry));
    adaIs(IdentityStatus.ACTIVE);
    when(lastAdmin.deactivate(any(), any()))
        .thenAnswer(call -> call.<Supplier<?>>getArgument(1).get());
    when(lastAdmin.removeRole(any(), any(), any()))
        .thenAnswer(call -> call.<Supplier<?>>getArgument(2).get());
  }

  private void lockTaken() {
    verify(jdbc).sql("select pg_advisory_xact_lock(?)");
    verify(jdbc.sql("select pg_advisory_xact_lock(?)")).param(Users.CHANGE_LOCK);
  }

  @Nested
  class Reading {

    @Test
    void me_is_my_entry() {
      assertThat(service.me(ada)).isEqualTo(new Me(ada, "Ada Lovelace", "ada@example.org", 0));
    }

    @Test
    void a_user_who_is_not_one_is_not_found() {
      UUID nobody = UUID.randomUUID();

      assertThatThrownBy(() -> service.me(nobody)).isInstanceOf(UserNotFoundException.class);
      assertThatThrownBy(() -> service.detail(nobody)).isInstanceOf(UserNotFoundException.class);
    }

    @Test
    void the_detail_is_the_entrys() {
      assertThat(service.detail(ada))
          .isEqualTo(
              new UserDetail(
                  ada, "Ada Lovelace", "ada@example.org", "MEMBER", "ACTIVE", JOINED, true, 0));
    }

    @Test
    void the_history_is_the_logs() {
      PageSpec page = new FirstPage();
      PageDto<Activity> history = new PageDto<>(List.of(), null);
      when(activityLog.history(ada, page)).thenReturn(history);

      assertThat(service.activities(ada, page)).isSameAs(history);
    }

    @Test
    void no_history_for_someone_who_is_not_a_user() {
      UUID nobody = UUID.randomUUID();
      PageSpec page = new FirstPage();

      assertThatThrownBy(() -> service.activities(nobody, page))
          .isInstanceOf(UserNotFoundException.class);
      verifyNoInteractions(activityLog);
    }
  }

  @Nested
  class Listing {

    @Test
    void pages_the_filtered_directory() {
      UserDirectoryEntry entry = entry("Ada Lovelace", 0);
      when(rbac.findRole("MEMBER")).thenReturn(Optional.of(member));
      when(directory.findAll(
              ArgumentMatchers.<Specification<UserDirectoryEntry>>any(), any(Pageable.class)))
          .thenReturn(new PageImpl<>(List.of(entry), PageRequest.of(0, 20), 1));

      PageDto<UserRow> page = service.list(new FirstPage(), new UserFilter("ada", "MEMBER", null));

      assertThat(page.data())
          .containsExactly(new UserRow(ada, "Ada Lovelace", "ada@example.org", "MEMBER", "ACTIVE"));
    }

    @Test
    void no_role_filter_needs_no_role_lookup() {
      when(directory.findAll(
              ArgumentMatchers.<Specification<UserDirectoryEntry>>any(), any(Pageable.class)))
          .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

      assertThat(service.list(new FirstPage(), new UserFilter(null, null, null)).data()).isEmpty();
      verifyNoInteractions(rbac);
    }

    @Test
    void an_unknown_role_is_a_field_error() {
      when(rbac.findRole("NOPE")).thenReturn(Optional.empty());
      UserFilter filter = new UserFilter(null, "NOPE", null);
      FirstPage page = new FirstPage();

      assertThatThrownBy(() -> service.list(page, filter))
          .isInstanceOfSatisfying(
              InvalidFieldException.class, e -> assertThat(e.getField()).isEqualTo("role"));
      verifyNoInteractions(directory);
    }
  }

  @Nested
  class Renaming {

    @Test
    void renames_them_and_records_it() {
      UserDetail detail = service.rename(ada, " Ada King ", 0L);

      assertThat(adaUser.getDisplayName()).isEqualTo("Ada King");
      verify(activityLog).append(ada, new UserRenamed("Ada Lovelace", "Ada King"));
      verify(users).saveAndFlush(adaUser);
      assertThat(detail.id()).isEqualTo(ada);
    }

    @Test
    void renaming_me_answers_me() {
      assertThat(service.renameMe(ada, "Ada King", 0L).id()).isEqualTo(ada);
      verify(activityLog).append(ada, new UserRenamed("Ada Lovelace", "Ada King"));
    }

    @Test
    void the_same_name_records_nothing() {
      service.rename(ada, "Ada Lovelace", 0L);

      verifyNoInteractions(activityLog);
    }

    @Test
    void a_stale_version_changes_nothing() {
      assertThatThrownBy(() -> service.rename(ada, "Ada King", 3L))
          .isInstanceOf(ObjectOptimisticLockingFailureException.class);
      assertThat(adaUser.getDisplayName()).isEqualTo("Ada Lovelace");
      verifyNoInteractions(activityLog);
    }

    @Test
    void someone_who_is_not_a_user_is_not_found() {
      UUID nobody = UUID.randomUUID();

      assertThatThrownBy(() -> service.rename(nobody, "Ada King", 0L))
          .isInstanceOf(UserNotFoundException.class);
    }
  }

  @Nested
  class Inviting {

    @Test
    void invites_them_and_records_it_in_the_invitation() {
      Invitation invitation = new Invitation(ada, EmailLinkOutcome.SENT);
      when(invitations.invite(eq("Grace"), eq("grace@example.org"), eq("MEMBER"), any()))
          .thenReturn(invitation);

      assertThat(service.invite("Grace", "grace@example.org", "MEMBER")).isSameAs(invitation);

      ArgumentCaptor<Consumer<Identity>> also = ArgumentCaptor.captor();
      verify(invitations)
          .invite(eq("Grace"), eq("grace@example.org"), eq("MEMBER"), also.capture());
      verifyNoInteractions(activityLog);
      also.getValue().accept(new Identity(ada, IdentityStatus.ACTIVE, JOINED, JOINED));
      verify(activityLog).append(ada, new UserInvited("Grace"));
    }

    @Test
    void a_role_that_cannot_be_given_is_a_field_error() {
      assertThatThrownBy(() -> service.invite("Grace", "grace@example.org", "OWNER"))
          .isInstanceOfSatisfying(
              InvalidFieldException.class, e -> assertThat(e.getField()).isEqualTo("role"));
      verifyNoInteractions(invitations);
    }

    @Test
    void an_address_already_taken_is_a_field_error() {
      when(invitations.invite(any(), any(), any(), any()))
          .thenThrow(new EmailAddressTakenException());

      assertThatThrownBy(() -> service.invite("Grace", "ada@example.org", "MEMBER"))
          .isInstanceOfSatisfying(
              InvalidFieldException.class,
              e -> {
                assertThat(e.getField()).isEqualTo("email");
                assertThat(e).hasMessage("That address already belongs to a user");
              });
    }
  }

  @Nested
  class Changing_a_role {

    @BeforeEach
    void theRoles() {
      when(rbac.findRequiredRole("MEMBER")).thenReturn(member);
      when(rbac.findRequiredRole("INSTRUCTOR")).thenReturn(instructor);
    }

    @Test
    void swaps_the_old_role_for_the_new_and_records_it() {
      when(rbac.findRolesForIdentity(ada)).thenReturn(List.of(member));

      assertThat(service.changeRole(ada, "INSTRUCTOR").id()).isEqualTo(ada);

      lockTaken();
      verify(lastAdmin).removeRole(eq(ada), eq(member.id()), any());
      verify(rbac).removeRoleFromIdentity(any(Identity.class), eq(member));
      verify(rbac).assignRoleToIdentity(any(Identity.class), eq(instructor));
      verify(activityLog).append(ada, new UserRoleChanged("MEMBER", "INSTRUCTOR"));
    }

    @Test
    void keeps_the_new_role_when_they_already_hold_it_among_others() {
      when(rbac.findRolesForIdentity(ada)).thenReturn(List.of(instructor, member));

      service.changeRole(ada, "INSTRUCTOR");

      verify(rbac).removeRoleFromIdentity(any(Identity.class), eq(member));
      verify(rbac, never()).removeRoleFromIdentity(any(Identity.class), eq(instructor));
      verify(rbac, never()).assignRoleToIdentity(any(), any());
      verify(activityLog).append(ada, new UserRoleChanged("INSTRUCTOR, MEMBER", "INSTRUCTOR"));
    }

    @Test
    void gives_a_role_to_someone_with_none() {
      when(rbac.findRolesForIdentity(ada)).thenReturn(List.of());

      service.changeRole(ada, "MEMBER");

      verify(rbac).assignRoleToIdentity(any(Identity.class), eq(member));
      verify(activityLog).append(ada, new UserRoleChanged("", "MEMBER"));
    }

    @Test
    void the_same_role_changes_nothing() {
      when(rbac.findRolesForIdentity(ada)).thenReturn(List.of(member));

      service.changeRole(ada, "MEMBER");

      verify(rbac, never()).assignRoleToIdentity(any(), any());
      verifyNoInteractions(lastAdmin, activityLog);
    }

    @Test
    void a_role_that_cannot_be_given_is_a_field_error() {
      assertThatThrownBy(() -> service.changeRole(ada, "OWNER"))
          .isInstanceOfSatisfying(
              InvalidFieldException.class, e -> assertThat(e.getField()).isEqualTo("role"));
      verify(rbac, never()).findRolesForIdentity(any());
    }

    @Test
    void someone_who_is_not_a_user_is_not_found() {
      UUID nobody = UUID.randomUUID();

      assertThatThrownBy(() -> service.changeRole(nobody, "MEMBER"))
          .isInstanceOf(UserNotFoundException.class);
    }

    @Test
    void a_user_without_an_identity_is_not_found() {
      when(identities.findById(ada)).thenReturn(Optional.empty());

      assertThatThrownBy(() -> service.changeRole(ada, "MEMBER"))
          .isInstanceOf(UserNotFoundException.class);
    }
  }

  @Nested
  class Making_an_owner {

    private final Role ownerRole = new Role(UUID.randomUUID(), "OWNER");

    @BeforeEach
    void theOwnerRole() {
      when(rbac.findRequiredRole("OWNER")).thenReturn(ownerRole);
    }

    @Test
    void gives_them_owner_in_place_of_their_role_and_records_it() {
      when(rbac.findRolesForIdentity(ada)).thenReturn(List.of(member));

      assertThat(service.makeOwner(ada).id()).isEqualTo(ada);

      lockTaken();
      verify(rbac).removeRoleFromIdentity(any(Identity.class), eq(member));
      verify(rbac).assignRoleToIdentity(any(Identity.class), eq(ownerRole));
      verify(activityLog).append(ada, new UserRoleChanged("MEMBER", "OWNER"));
    }

    @Test
    void an_owner_already_changes_nothing() {
      when(rbac.findRolesForIdentity(ada)).thenReturn(List.of(ownerRole));

      service.makeOwner(ada);

      verify(rbac, never()).assignRoleToIdentity(any(), any());
      verifyNoInteractions(activityLog);
    }

    @Test
    void someone_who_is_not_a_user_is_not_found() {
      UUID nobody = UUID.randomUUID();

      assertThatThrownBy(() -> service.makeOwner(nobody)).isInstanceOf(UserNotFoundException.class);
    }
  }

  @Nested
  class Status {

    @Test
    void deactivating_goes_through_the_guard_and_records_it() {
      assertThat(service.deactivate(owner, ada).id()).isEqualTo(ada);

      lockTaken();
      verify(lastAdmin).deactivate(eq(ada), any());
      verify(whoService).deactivate(ada);
      verify(activityLog).append(ada, new UserDeactivated());
    }

    @Test
    void no_one_deactivates_themselves() {
      assertThatThrownBy(() -> service.deactivate(ada, ada))
          .isInstanceOf(InvariantViolationException.class)
          .hasMessage("You cannot deactivate yourself");
      verifyNoInteractions(whoService, activityLog);
    }

    @Test
    void deactivating_the_deactivated_is_a_conflict() {
      adaIs(IdentityStatus.SUSPENDED);

      assertThatThrownBy(() -> service.deactivate(owner, ada))
          .isInstanceOf(ConflictException.class)
          .hasMessage("Already deactivated");
      verifyNoInteractions(whoService, activityLog);
    }

    @Test
    void reactivating_records_it() {
      adaIs(IdentityStatus.SUSPENDED);

      assertThat(service.reactivate(ada).id()).isEqualTo(ada);

      lockTaken();
      verify(whoService).reactivate(ada);
      verify(activityLog).append(ada, new UserReactivated());
    }

    @Test
    void reactivating_the_active_is_a_conflict() {
      assertThatThrownBy(() -> service.reactivate(ada))
          .isInstanceOf(ConflictException.class)
          .hasMessage("Already active");
      verifyNoInteractions(whoService, activityLog);
    }
  }

  @Nested
  class Signing_out_everywhere {

    @Test
    void ends_their_sessions() {
      service.signOutEverywhere(ada);

      verify(sessions).endAll(ada);
    }

    @Test
    void someone_who_is_not_a_user_is_not_found() {
      UUID nobody = UUID.randomUUID();

      assertThatThrownBy(() -> service.signOutEverywhere(nobody))
          .isInstanceOf(UserNotFoundException.class);
      verifyNoInteractions(sessions);
    }
  }

  @Nested
  class Resending_an_invitation {

    @Test
    void resends_to_someone_who_never_signed_in() {
      when(invitations.resend(ada)).thenReturn(EmailLinkOutcome.SENT);

      assertThat(service.resendInvitation(ada)).isTrue();
    }

    @Test
    void says_when_no_link_went_out() {
      when(invitations.resend(ada)).thenReturn(EmailLinkOutcome.RESEND_SUPPRESSED);

      assertThat(service.resendInvitation(ada)).isFalse();
    }

    @Test
    void someone_who_has_signed_in_is_a_conflict() {
      UserDirectoryEntry signedIn = entry("Ada Lovelace", 0);
      when(signedIn.isInvited()).thenReturn(false);
      when(directory.findById(ada)).thenReturn(Optional.of(signedIn));

      assertThatThrownBy(() -> service.resendInvitation(ada))
          .isInstanceOf(ConflictException.class)
          .hasMessage("Already signed in");
      verifyNoInteractions(invitations);
    }

    @Test
    void someone_who_is_not_a_user_is_not_found() {
      UUID nobody = UUID.randomUUID();

      assertThatThrownBy(() -> service.resendInvitation(nobody))
          .isInstanceOf(UserNotFoundException.class);
      verifyNoInteractions(invitations);
    }
  }
}
