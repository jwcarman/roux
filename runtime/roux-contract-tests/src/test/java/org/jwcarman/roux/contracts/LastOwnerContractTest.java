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
package org.jwcarman.roux.contracts;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.roles.OwnerBootstrap;
import org.jwcarman.roux.roles.RouxRoles;
import org.jwcarman.who.admin.LastAdminException;
import org.jwcarman.who.admin.LastAdminGuard;
import org.jwcarman.who.core.domain.Identity;
import org.jwcarman.who.core.service.WhoService;
import org.jwcarman.who.rbac.RbacService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

/**
 * The last owner as a roux app gets it: who-admin's guard enforces (who-rbac resolves the
 * permissions), OWNER is the role that may manage people, and an app endpoint whose service calls
 * the guard answers roux's 409. who-admin's own endpoints call the same guard; who tests those.
 */
@SpringBootTest(classes = ContractTestApplication.class)
@AutoConfigureMockMvc
@Import(LastOwnerContractTest.DeactivateController.class)
class LastOwnerContractTest {

  @Autowired LastAdminGuard guard;
  @Autowired WhoService who;
  @Autowired RbacService rbac;
  @Autowired JdbcClient jdbc;
  @Autowired OwnerBootstrap bootstrap;
  @Autowired MockMvc mvc;

  /** An app endpoint whose deactivation goes through the guard, as the guide says to write it. */
  @RestController
  static class DeactivateController {
    private final LastAdminGuard guard;
    private final WhoService who;

    DeactivateController(LastAdminGuard guard, WhoService who) {
      this.guard = guard;
      this.who = who;
    }

    @GetMapping("/api/test/members/{id}/deactivate")
    boolean deactivate(@PathVariable UUID id) {
      return guard.deactivate(id, () -> who.deactivate(id));
    }
  }

  @AfterEach
  void oneActiveOwnerAgain() {
    jdbc.sql("select id from who_identity").query(UUID.class).list().forEach(who::deleteIdentity);
    bootstrap.run(null);
  }

  private UUID theOwner() {
    List<UUID> owners =
        jdbc.sql(
                "select ir.identity_id from who_identity_role ir join who_role r on r.id ="
                    + " ir.role_id join who_identity i on i.id = ir.identity_id where r.name ="
                    + " 'OWNER' and i.status = 'ACTIVE'")
            .query(UUID.class)
            .list();
    assertThat(owners).hasSize(1);
    return owners.getFirst();
  }

  @Test
  void theGuardEnforces() {
    assertThat(guard.isEnforcing()).isTrue();
  }

  @Test
  void theLastOwnerCannotBeDeactivated() {
    UUID owner = theOwner();

    assertThatThrownBy(() -> guard.deactivate(owner, () -> who.deactivate(owner)))
        .isInstanceOf(LastAdminException.class);
  }

  @Test
  void theLastOwnerCannotLoseOwner() {
    UUID owner = theOwner();
    UUID ownerRole = rbac.findRequiredRole(RouxRoles.OWNER).id();

    assertThatThrownBy(() -> guard.removeRole(owner, ownerRole, () -> true))
        .isInstanceOf(LastAdminException.class);
  }

  @Test
  void anOwnerMayGoWhileAnotherIsActive() {
    UUID first = theOwner();
    Identity second = who.createIdentity();
    rbac.assignRoleToIdentity(second, rbac.findRequiredRole(RouxRoles.OWNER));

    assertThat(guard.deactivate(first, () -> who.deactivate(first))).isTrue();
  }

  @Test
  void anAppEndpointAnswersRouxsConflict() throws Exception {
    mvc.perform(get("/api/test/members/" + theOwner() + "/deactivate").with(user("someone")))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.code").value("last-admin"))
        .andExpect(
            jsonPath("$.detail").value("The team needs someone active who can manage people"));
  }
}
