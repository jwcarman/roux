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

import org.jwcarman.roux.roles.CallerPermissions;
import org.jwcarman.roux.roles.InvitableRoles;
import org.jwcarman.roux.roles.InvitableRolesController;
import org.jwcarman.roux.roles.InvitableRolesGuard;
import org.jwcarman.roux.roles.OwnerBootstrap;
import org.jwcarman.who.core.service.WhoService;
import org.jwcarman.who.emaillink.EmailCredentialService;
import org.jwcarman.who.rbac.RbacService;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication.Type;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * roux's roles, with roux-roles on the class path and who's role and email-link services present:
 * the first owner from {@code roux.owner.*}, and the roles an invitation may give from {@code
 * roux.roles.invitable}. The OWNER role itself comes from roux-roles' changelog, which migratory
 * runs.
 */
@AutoConfiguration(
    afterName = {
      "org.jwcarman.who.autoconfigure.WhoAutoConfiguration",
      "org.jwcarman.who.autoconfigure.WhoEmailLinkAutoConfiguration"
    })
@ConditionalOnClass(OwnerBootstrap.class)
@ConditionalOnBean({RbacService.class, EmailCredentialService.class})
@EnableConfigurationProperties({RouxOwnerProperties.class, RouxRolesProperties.class})
public class RouxRolesAutoConfiguration {

  /**
   * Makes the first owner at startup.
   *
   * @param jdbc takes the bootstrap's lock and finds active owners
   * @param rbac assigns OWNER
   * @param who creates the owner's identity
   * @param emailCredentials registers the owner's address
   * @param events publishes {@code OwnerCreated}
   * @param transactionManager runs the owner's transaction
   * @param owner {@code roux.owner.*}
   * @return the bootstrap
   */
  @Bean
  @ConditionalOnMissingBean
  public OwnerBootstrap rouxOwnerBootstrap(
      JdbcClient jdbc,
      RbacService rbac,
      WhoService who,
      EmailCredentialService emailCredentials,
      ApplicationEventPublisher events,
      PlatformTransactionManager transactionManager,
      RouxOwnerProperties owner) {
    return new OwnerBootstrap(
        jdbc, rbac, who, emailCredentials, events, transactionManager, owner.email(), owner.name());
  }

  /**
   * What the signed-in caller may do, for the parts of a response only some callers see.
   *
   * @return the caller's permissions
   */
  @Bean
  @ConditionalOnMissingBean
  public CallerPermissions rouxCallerPermissions() {
    return new CallerPermissions();
  }

  /**
   * The roles an invitation may give.
   *
   * @param roles {@code roux.roles.*}
   * @return the checked list
   */
  @Bean
  @ConditionalOnMissingBean
  public InvitableRoles rouxInvitableRoles(RouxRolesProperties roles) {
    return new InvitableRoles(roles.invitable());
  }

  /**
   * Refuses any invitation giving a role outside the list.
   *
   * @param invitable the roles an invitation may give
   * @return the guard
   */
  @Bean
  @ConditionalOnMissingBean
  public InvitableRolesGuard rouxInvitableRolesGuard(InvitableRoles invitable) {
    return new InvitableRolesGuard(invitable);
  }

  /**
   * Serves the list to the invite form.
   *
   * @param invitable the roles an invitation may give
   * @return the controller
   */
  @Bean
  @ConditionalOnMissingBean
  @ConditionalOnWebApplication(type = Type.SERVLET)
  public InvitableRolesController rouxInvitableRolesController(InvitableRoles invitable) {
    return new InvitableRolesController(invitable);
  }
}
