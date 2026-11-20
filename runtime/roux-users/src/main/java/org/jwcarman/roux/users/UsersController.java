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

import java.util.UUID;

import jakarta.validation.Valid;

import org.jwcarman.jpa.pagination.PageDto;
import org.jwcarman.jpa.spring.web.PageParams;
import org.jwcarman.roux.activity.Activity;
import org.jwcarman.who.core.domain.WhoPrincipal;
import org.jwcarman.who.spring.security.RequiresPermission;
import org.jwcarman.who.spring.security.RequiresRecentSignIn;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Managing the app's users, under {@code /api/users}, each endpoint behind its permission. */
@RestController
@RequestMapping("/api/users")
public class UsersController {

  private final Users users;

  /**
   * Creates the controller.
   *
   * @param users the users
   */
  public UsersController(Users users) {
    this.users = users;
  }

  /**
   * A page of users.
   *
   * @param params the page and its sort ({@link UserSort})
   * @param search words to find in the name or the email
   * @param role a role's name
   * @param status the status to show; active when absent
   * @return the page
   */
  @GetMapping
  @RequiresPermission(RouxUserPermissions.USERS_READ)
  public PageDto<UserRow> list(
      @ModelAttribute PageParams params,
      @RequestParam(required = false) String search,
      @RequestParam(required = false) String role,
      @RequestParam(required = false) UserStatus status) {
    return users.list(params, new UserFilter(search, role, status));
  }

  /**
   * One user.
   *
   * @param id their identity's id
   * @return their detail
   */
  @GetMapping("/{id}")
  @RequiresPermission(RouxUserPermissions.USERS_READ)
  public UserDetail detail(@PathVariable UUID id) {
    return users.detail(id);
  }

  /**
   * A user's history, newest first.
   *
   * @param id their identity's id
   * @param params the page
   * @return the page
   */
  @GetMapping("/{id}/activities")
  @RequiresPermission(RouxUserPermissions.USERS_READ)
  public PageDto<Activity> activities(@PathVariable UUID id, @ModelAttribute PageParams params) {
    return users.activities(id, params);
  }

  /**
   * Invites someone; answered once the email has been tried.
   *
   * @param request who, and with which role
   * @return whether the link went out
   */
  @PostMapping("/invitations")
  @ResponseStatus(HttpStatus.ACCEPTED)
  @RequiresPermission(RouxUserPermissions.USERS_INVITE)
  public InvitationResult invite(@Valid @RequestBody InvitationRequest request) {
    return new InvitationResult(
        users.invite(request.name(), request.email(), request.role()).linkSent());
  }

  /**
   * Sends someone's invitation again, if they have never signed in.
   *
   * @param id their identity's id
   * @return whether the link went out
   */
  @PostMapping("/{id}/invitation")
  @ResponseStatus(HttpStatus.ACCEPTED)
  @RequiresPermission(RouxUserPermissions.USERS_INVITE)
  public InvitationResult resendInvitation(@PathVariable UUID id) {
    return new InvitationResult(users.resendInvitation(id));
  }

  /**
   * Renames a user.
   *
   * @param id their identity's id
   * @param change the new name and the version read
   * @return their detail now
   */
  @PutMapping("/{id}/name")
  @RequiresPermission(RouxUserPermissions.USERS_MANAGE)
  public UserDetail rename(@PathVariable UUID id, @Valid @RequestBody NameChange change) {
    return users.rename(id, change.displayName(), change.version());
  }

  /**
   * Changes a user's role.
   *
   * @param id their identity's id
   * @param change the new role
   * @return their detail now
   */
  @PutMapping("/{id}/role")
  @RequiresPermission(RouxUserPermissions.USERS_MANAGE)
  public UserDetail changeRole(@PathVariable UUID id, @Valid @RequestBody RoleChange change) {
    return users.changeRole(id, change.role());
  }

  /**
   * Makes an existing user an owner, in place of their role. Only for a caller who signed in
   * recently: one who signed in too long ago gets who's {@code 401} and signs in again.
   *
   * @param id their identity's id
   * @return their detail now
   */
  @PostMapping("/{id}/owner")
  @RequiresPermission(RouxUserPermissions.USERS_OWNERS)
  @RequiresRecentSignIn
  public UserDetail makeOwner(@PathVariable UUID id) {
    return users.makeOwner(id);
  }

  /**
   * Deactivates a user.
   *
   * @param principal who is asking
   * @param id their identity's id
   * @return their detail now
   */
  @PostMapping("/{id}/deactivate")
  @RequiresPermission(RouxUserPermissions.USERS_MANAGE)
  public UserDetail deactivate(
      @AuthenticationPrincipal WhoPrincipal principal, @PathVariable UUID id) {
    return users.deactivate(principal.identity().id(), id);
  }

  /**
   * Reactivates a user.
   *
   * @param id their identity's id
   * @return their detail now
   */
  @PostMapping("/{id}/reactivate")
  @RequiresPermission(RouxUserPermissions.USERS_MANAGE)
  public UserDetail reactivate(@PathVariable UUID id) {
    return users.reactivate(id);
  }

  /**
   * Signs a user out on every device.
   *
   * @param id their identity's id
   */
  @PostMapping("/{id}/sign-out")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  @RequiresPermission(RouxUserPermissions.USERS_MANAGE)
  public void signOutEverywhere(@PathVariable UUID id) {
    users.signOutEverywhere(id);
  }
}
