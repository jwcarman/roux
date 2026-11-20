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
package org.jwcarman.roux.autoconfigure.roles;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.roles.CallerPermissions;
import org.jwcarman.roux.roles.InvitableRoles;
import org.jwcarman.roux.roles.InvitableRolesController;
import org.jwcarman.roux.roles.InvitableRolesGuard;
import org.jwcarman.roux.roles.OwnerBootstrap;
import org.jwcarman.roux.roles.UserInvitations;
import org.jwcarman.who.core.service.WhoService;
import org.jwcarman.who.emaillink.EmailCredentialService;
import org.jwcarman.who.emaillink.InvitationService;
import org.jwcarman.who.rbac.RbacService;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;

@DisplayNameGeneration(ReplaceUnderscores.class)
class RouxRolesAutoConfigurationTest {

  private final ApplicationContextRunner runner =
      new ApplicationContextRunner()
          .withConfiguration(AutoConfigurations.of(RouxRolesAutoConfiguration.class))
          .withBean(JdbcClient.class, () -> mock(JdbcClient.class))
          .withBean(RbacService.class, () -> mock(RbacService.class))
          .withBean(WhoService.class, () -> mock(WhoService.class))
          .withBean(EmailCredentialService.class, () -> mock(EmailCredentialService.class))
          .withBean(InvitationService.class, () -> mock(InvitationService.class))
          .withBean(PlatformTransactionManager.class, () -> mock(PlatformTransactionManager.class));

  @Test
  void the_bootstrap_is_registered_with_the_owner_settings() {
    runner
        .withPropertyValues("roux.owner.email=pat@example.com", "roux.owner.name=Pat")
        .run(
            context ->
                assertThat(context)
                    .getBean(OwnerBootstrap.class)
                    .isInstanceOf(OwnerBootstrap.class));
  }

  @Test
  void the_callers_permissions_are_there_to_inject() {
    runner
        .withPropertyValues("roux.owner.email=pat@example.com", "roux.owner.name=Pat")
        .run(
            context ->
                assertThat(context)
                    .getBean(CallerPermissions.class)
                    .isInstanceOf(CallerPermissions.class));
  }

  @Test
  void members_are_invited_by_name_through_roux() {
    runner
        .withPropertyValues("roux.owner.email=pat@example.com", "roux.owner.name=Pat")
        .run(
            context ->
                assertThat(context)
                    .getBean(UserInvitations.class)
                    .isInstanceOf(UserInvitations.class));
  }

  @Test
  void a_missing_owner_setting_fails_startup_naming_it() {
    runner
        .withPropertyValues("roux.owner.name=Pat")
        .run(
            context ->
                assertThat(context)
                    .getFailure()
                    .rootCause()
                    .hasMessage("roux.owner.email must be set to the first owner's address"));
  }

  @Test
  void without_who_s_role_services_nothing_is_registered() {
    new ApplicationContextRunner()
        .withConfiguration(AutoConfigurations.of(RouxRolesAutoConfiguration.class))
        .run(context -> assertThat(context).doesNotHaveBean(OwnerBootstrap.class));
  }

  @Test
  void the_invitable_roles_and_their_guard_are_registered() {
    runner
        .withPropertyValues(
            "roux.owner.email=pat@example.com",
            "roux.owner.name=Pat",
            "roux.roles.invitable=MEMBER,INSTRUCTOR")
        .run(
            context -> {
              assertThat(context.getBean(InvitableRoles.class).names())
                  .containsExactly("MEMBER", "INSTRUCTOR");
              assertThat(context)
                  .getBean(InvitableRolesGuard.class)
                  .isInstanceOf(InvitableRolesGuard.class);
              assertThat(context).doesNotHaveBean(InvitableRolesController.class);
            });
  }

  @Test
  void none_listed_means_no_role_is_invitable() {
    runner
        .withPropertyValues("roux.owner.email=pat@example.com", "roux.owner.name=Pat")
        .run(context -> assertThat(context.getBean(InvitableRoles.class).names()).isEmpty());
  }

  @Test
  void listing_owner_fails_startup() {
    runner
        .withPropertyValues(
            "roux.owner.email=pat@example.com", "roux.owner.name=Pat", "roux.roles.invitable=OWNER")
        .run(
            context ->
                assertThat(context)
                    .getFailure()
                    .rootCause()
                    .hasMessage(
                        "roux.roles.invitable may not list OWNER: owners are never invited"));
  }

  @Test
  void a_web_application_serves_the_list() {
    new WebApplicationContextRunner()
        .withConfiguration(AutoConfigurations.of(RouxRolesAutoConfiguration.class))
        .withBean(JdbcClient.class, () -> mock(JdbcClient.class))
        .withBean(RbacService.class, () -> mock(RbacService.class))
        .withBean(WhoService.class, () -> mock(WhoService.class))
        .withBean(EmailCredentialService.class, () -> mock(EmailCredentialService.class))
        .withBean(InvitationService.class, () -> mock(InvitationService.class))
        .withBean(PlatformTransactionManager.class, () -> mock(PlatformTransactionManager.class))
        .withPropertyValues("roux.owner.email=pat@example.com", "roux.owner.name=Pat")
        .run(
            context ->
                assertThat(context)
                    .getBean(InvitableRolesController.class)
                    .isInstanceOf(InvitableRolesController.class));
  }
}
