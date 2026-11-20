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
package org.jwcarman.roux.autoconfigure.users;

import jakarta.persistence.EntityManager;

import org.jwcarman.roux.activity.ActivityLog;
import org.jwcarman.roux.activity.ActorNames;
import org.jwcarman.roux.autoconfigure.activity.RouxActivityLogAutoConfiguration;
import org.jwcarman.roux.roles.InvitableRoles;
import org.jwcarman.roux.roles.UserInvitations;
import org.jwcarman.roux.users.AppUserActorNames;
import org.jwcarman.roux.users.AppUserRepository;
import org.jwcarman.roux.users.AppUsers;
import org.jwcarman.roux.users.InvitationRequest;
import org.jwcarman.roux.users.InvitationResult;
import org.jwcarman.roux.users.Me;
import org.jwcarman.roux.users.MeController;
import org.jwcarman.roux.users.NameChange;
import org.jwcarman.roux.users.RoleChange;
import org.jwcarman.roux.users.UserDetail;
import org.jwcarman.roux.users.UserDirectory;
import org.jwcarman.roux.users.UserRow;
import org.jwcarman.roux.users.Users;
import org.jwcarman.roux.users.UsersController;
import org.jwcarman.who.admin.LastAdminGuard;
import org.jwcarman.who.core.repository.IdentityRepository;
import org.jwcarman.who.core.service.WhoService;
import org.jwcarman.who.core.service.WhoSessions;
import org.jwcarman.who.rbac.RbacService;
import org.springframework.aot.hint.annotation.RegisterReflectionForBinding;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication.Type;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * The app's users: an {@code AppUser} for everyone who joins ({@link AppUsers}). Runs after Spring
 * Data JPA has made roux-users' repositories, and only with them.
 */
@AutoConfiguration(
    before = RouxActivityLogAutoConfiguration.class,
    afterName =
        "org.springframework.boot.data.jpa.autoconfigure.DataJpaRepositoriesAutoConfiguration")
@ConditionalOnClass({AppUsers.class, EntityManager.class})
@ConditionalOnBean(AppUserRepository.class)
public class RouxUsersAutoConfiguration {

  @Bean
  AppUsers rouxAppUsers(AppUserRepository users) {
    return new AppUsers(users);
  }

  @Bean
  @ConditionalOnMissingBean(ActorNames.class)
  AppUserActorNames rouxAppUserActorNames(AppUserRepository users) {
    return new AppUserActorNames(users);
  }

  @Bean
  Users rouxUsers(
      AppUserRepository users,
      UserDirectory directory,
      ActivityLog activityLog,
      UserInvitations invitations,
      InvitableRoles invitable,
      WhoService who,
      IdentityRepository identities,
      RbacService rbac,
      WhoSessions sessions,
      LastAdminGuard lastAdmin,
      JdbcClient jdbc) {
    return new Users(
        users,
        directory,
        activityLog,
        invitations,
        invitable,
        new Users.Who(who, identities, rbac, sessions, lastAdmin, jdbc));
  }

  /** The users endpoints, in a servlet web app. */
  @Configuration(proxyBeanMethods = false)
  @ConditionalOnWebApplication(type = Type.SERVLET)
  @RegisterReflectionForBinding({
    Me.class,
    UserRow.class,
    UserDetail.class,
    NameChange.class,
    RoleChange.class,
    InvitationRequest.class,
    InvitationResult.class
  })
  static class Endpoints {

    @Bean
    UsersController rouxUsersController(Users users) {
      return new UsersController(users);
    }

    @Bean
    MeController rouxMeController(Users users) {
      return new MeController(users);
    }
  }
}
