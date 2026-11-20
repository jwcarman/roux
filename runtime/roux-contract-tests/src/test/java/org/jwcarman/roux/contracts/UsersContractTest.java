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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.roles.OwnerBootstrap;
import org.jwcarman.roux.roles.UserInvitations;
import org.jwcarman.roux.users.RouxUserPermissions;
import org.jwcarman.who.core.repository.IdentityRepository;
import org.jwcarman.who.core.service.WhoService;
import org.jwcarman.who.emaillink.EmailCredentialService;
import org.jwcarman.who.rbac.RbacService;
import org.jwcarman.who.rbac.Role;
import org.jwcarman.who.test.WhoMockMvcBrowser;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** roux's users endpoints, called by people signed in to who for real. */
@SpringBootTest(
    classes = ContractTestApplication.class,
    properties = "roux.roles.invitable=MEMBER,INSTRUCTOR")
@AutoConfigureMockMvc
@DisplayNameGeneration(ReplaceUnderscores.class)
class UsersContractTest {

  @Autowired MockMvc mvc;
  @Autowired UserInvitations invitations;
  @Autowired EmailCredentialService emails;
  @Autowired WhoService who;
  @Autowired IdentityRepository identities;
  @Autowired RbacService rbac;
  @Autowired OwnerBootstrap bootstrap;
  @Autowired JdbcClient jdbc;

  /** Someone signed in: their identity and their browser. */
  record Person(UUID id, String email, WhoMockMvcBrowser browser) {
    ResultActions perform(MockHttpServletRequestBuilder request) throws Exception {
      return browser.perform(request);
    }
  }

  private Person owner;
  private Person ada;

  private Person signedIn(String email) {
    UUID credential = emails.findByAddress(email).orElseThrow().id();
    UUID id =
        jdbc.sql("select identity_id from who_credential_identity where credential_id = ?")
            .param(credential)
            .query(UUID.class)
            .single();
    return new Person(id, email, new WhoMockMvcBrowser(mvc).signedInAs(id, credential));
  }

  private Person joins(String name, String role) {
    String email = UUID.randomUUID() + "@roux.test";
    invitations.invite(name, email, role);
    return signedIn(email);
  }

  private static MockHttpServletRequestBuilder json(
      MockHttpServletRequestBuilder request, String body) {
    return request.contentType(MediaType.APPLICATION_JSON).content(body);
  }

  @BeforeEach
  void theOwnerAndAda() {
    for (String role : new String[] {"MEMBER", "INSTRUCTOR"}) {
      jdbc.sql("insert into who_role (id, name) values (?, ?) on conflict (name) do nothing")
          .params(UUID.randomUUID(), role)
          .update();
    }
    owner = signedIn("owner@roux.test");
    ada = joins("Ada Lovelace", "MEMBER");
  }

  @AfterEach
  void oneOwnerAgain() {
    jdbc.sql("select id from who_identity").query(UUID.class).list().forEach(who::deleteIdentity);
    bootstrap.run(null);
  }

  private void lastActivityIs(UUID id, String type) throws Exception {
    owner
        .perform(get("/api/users/" + id + "/activities"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data[0].type").value(type));
  }

  private void noActivity(UUID id) throws Exception {
    owner
        .perform(get("/api/users/" + id + "/activities"))
        .andExpect(jsonPath("$.data.length()").value(0));
  }

  @Nested
  class Me {

    @Test
    void shows_my_name_address_and_version() throws Exception {
      ada.perform(get("/api/users/me"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.id").value(ada.id().toString()))
          .andExpect(jsonPath("$.displayName").value("Ada Lovelace"))
          .andExpect(jsonPath("$.email").value(ada.email()))
          .andExpect(jsonPath("$.version").value(0));
    }

    @Test
    void renames_me_and_records_it() throws Exception {
      ada.perform(json(put("/api/users/me"), "{\"displayName\":\" Ada King \",\"version\":0}"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.displayName").value("Ada King"))
          .andExpect(jsonPath("$.version").value(1));

      lastActivityIs(ada.id(), "user.renamed");
    }

    @Test
    void a_stale_version_is_a_conflict() throws Exception {
      ada.perform(json(put("/api/users/me"), "{\"displayName\":\"Ada King\",\"version\":5}"))
          .andExpect(status().isConflict());
    }

    @Test
    void a_blank_name_is_a_field_error() throws Exception {
      ada.perform(json(put("/api/users/me"), "{\"displayName\":\"  \",\"version\":0}"))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.errors[0].field").value("displayName"));
    }

    @Test
    void signed_out_is_unauthorized() throws Exception {
      new WhoMockMvcBrowser(mvc).perform(get("/api/users/me")).andExpect(status().isUnauthorized());
    }
  }

  @Nested
  class The_list {

    @Test
    void needs_users_read() throws Exception {
      ada.perform(get("/api/users")).andExpect(status().isForbidden());
    }

    @Test
    void shows_the_active_users_by_name() throws Exception {
      owner
          .perform(get("/api/users").param("search", "lovelace"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.data[0].id").value(ada.id().toString()))
          .andExpect(jsonPath("$.data[0].displayName").value("Ada Lovelace"))
          .andExpect(jsonPath("$.data[0].email").value(ada.email()))
          .andExpect(jsonPath("$.data[0].role").value("MEMBER"))
          .andExpect(jsonPath("$.data[0].status").value("ACTIVE"));
    }

    @Test
    void an_unknown_role_is_a_field_error() throws Exception {
      owner
          .perform(get("/api/users").param("role", "NOPE"))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.errors[0].field").value("role"));
    }

    @Test
    void shows_the_deactivated_when_asked() throws Exception {
      owner.perform(post("/api/users/" + ada.id() + "/deactivate")).andExpect(status().isOk());

      owner
          .perform(get("/api/users").param("status", "DEACTIVATED"))
          .andExpect(jsonPath("$.data.length()").value(1))
          .andExpect(jsonPath("$.data[0].id").value(ada.id().toString()));
    }
  }

  @Nested
  class One_user {

    @Test
    void shows_their_detail() throws Exception {
      owner
          .perform(get("/api/users/" + ada.id()))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.displayName").value("Ada Lovelace"))
          .andExpect(jsonPath("$.role").value("MEMBER"))
          .andExpect(jsonPath("$.joinedAt").isNotEmpty())
          .andExpect(jsonPath("$.invited").value(false))
          .andExpect(jsonPath("$.version").value(0));
    }

    @Test
    void an_unknown_one_is_not_found() throws Exception {
      owner.perform(get("/api/users/" + UUID.randomUUID())).andExpect(status().isNotFound());
      owner
          .perform(get("/api/users/" + UUID.randomUUID() + "/activities"))
          .andExpect(status().isNotFound());
    }
  }

  @Nested
  class Inviting {

    private static final String GRACE =
        "{\"name\":\"Grace Hopper\",\"email\":\"%s\",\"role\":\"%s\"}";

    @Test
    void invites_and_records_it() throws Exception {
      String email = UUID.randomUUID() + "@roux.test";

      owner
          .perform(json(post("/api/users/invitations"), GRACE.formatted(email, "MEMBER")))
          .andExpect(status().isAccepted())
          .andExpect(jsonPath("$.linkSent").isBoolean());

      Person grace = signedIn(email);
      lastActivityIs(grace.id(), "user.invited");
    }

    @Test
    void an_address_already_taken_is_a_field_error() throws Exception {
      owner
          .perform(json(post("/api/users/invitations"), GRACE.formatted(ada.email(), "MEMBER")))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.errors[0].field").value("email"))
          .andExpect(
              jsonPath("$.errors[0].message").value("That address already belongs to a user"));
    }

    @Test
    void a_role_that_cannot_be_given_is_a_field_error() throws Exception {
      owner
          .perform(
              json(
                  post("/api/users/invitations"),
                  GRACE.formatted(UUID.randomUUID() + "@roux.test", "OWNER")))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.errors[0].field").value("role"));
    }

    @Test
    void needs_users_invite() throws Exception {
      ada.perform(
              json(
                  post("/api/users/invitations"),
                  GRACE.formatted(UUID.randomUUID() + "@roux.test", "MEMBER")))
          .andExpect(status().isForbidden());
    }
  }

  @Nested
  class Renaming_someone {

    @Test
    void renames_them_and_records_it() throws Exception {
      owner
          .perform(
              json(
                  put("/api/users/" + ada.id() + "/name"),
                  "{\"displayName\":\"Ada King\",\"version\":0}"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.displayName").value("Ada King"))
          .andExpect(jsonPath("$.version").value(1));

      owner
          .perform(get("/api/users/" + ada.id() + "/activities"))
          .andExpect(jsonPath("$.data[0].type").value("user.renamed"))
          .andExpect(jsonPath("$.data[0].actorId").value(owner.id().toString()));
    }

    @Test
    void the_same_name_records_nothing() throws Exception {
      owner
          .perform(
              json(
                  put("/api/users/" + ada.id() + "/name"),
                  "{\"displayName\":\"Ada Lovelace\",\"version\":0}"))
          .andExpect(status().isOk());

      noActivity(ada.id());
    }

    @Test
    void needs_users_manage() throws Exception {
      ada.perform(
              json(
                  put("/api/users/" + ada.id() + "/name"),
                  "{\"displayName\":\"Ada King\",\"version\":0}"))
          .andExpect(status().isForbidden());
    }
  }

  @Nested
  class Changing_a_role {

    @Test
    void gives_them_only_the_new_role_and_records_it() throws Exception {
      owner
          .perform(json(put("/api/users/" + ada.id() + "/role"), "{\"role\":\"INSTRUCTOR\"}"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.role").value("INSTRUCTOR"));

      assertThat(rbac.findRolesForIdentity(ada.id()))
          .extracting(Role::name)
          .containsExactly("INSTRUCTOR");
      lastActivityIs(ada.id(), "user.role_changed");
    }

    @Test
    void the_same_role_records_nothing() throws Exception {
      owner
          .perform(json(put("/api/users/" + ada.id() + "/role"), "{\"role\":\"MEMBER\"}"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.role").value("MEMBER"));

      noActivity(ada.id());
    }

    @Test
    void a_role_that_cannot_be_given_is_a_field_error() throws Exception {
      owner
          .perform(json(put("/api/users/" + ada.id() + "/role"), "{\"role\":\"OWNER\"}"))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.errors[0].field").value("role"));
    }

    @Test
    void the_last_owner_keeps_owner() throws Exception {
      owner
          .perform(json(put("/api/users/" + owner.id() + "/role"), "{\"role\":\"MEMBER\"}"))
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.code").value("last-admin"));
    }
  }

  @Nested
  class Status {

    @Test
    void deactivating_records_it_and_signs_them_out() throws Exception {
      owner
          .perform(post("/api/users/" + ada.id() + "/deactivate"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.status").value("DEACTIVATED"));

      lastActivityIs(ada.id(), "user.deactivated");
      ada.perform(get("/api/users/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void no_one_deactivates_themselves() throws Exception {
      owner
          .perform(post("/api/users/" + owner.id() + "/deactivate"))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.detail").value("You cannot deactivate yourself"));
    }

    @Test
    void deactivating_twice_is_a_conflict() throws Exception {
      owner.perform(post("/api/users/" + ada.id() + "/deactivate"));

      owner
          .perform(post("/api/users/" + ada.id() + "/deactivate"))
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.detail").value("Already deactivated"));
    }

    @Test
    void reactivating_records_it() throws Exception {
      owner.perform(post("/api/users/" + ada.id() + "/deactivate"));

      owner
          .perform(post("/api/users/" + ada.id() + "/reactivate"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.status").value("ACTIVE"));
      lastActivityIs(ada.id(), "user.reactivated");
    }

    @Test
    void reactivating_an_active_user_is_a_conflict() throws Exception {
      owner
          .perform(post("/api/users/" + ada.id() + "/reactivate"))
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.detail").value("Already active"));
    }

    @Test
    void the_last_owner_stays_active() throws Exception {
      Role manager = rbac.findRole("MANAGER").orElseGet(() -> rbac.createRole("MANAGER"));
      rbac.addPermissionToRole(manager, RouxUserPermissions.USERS_MANAGE);
      Person grace = joins("Grace Hopper", "MEMBER");
      rbac.assignRoleToIdentity(identities.findById(grace.id()).orElseThrow(), manager);

      grace
          .perform(post("/api/users/" + owner.id() + "/deactivate"))
          .andExpect(status().isConflict())
          .andExpect(jsonPath("$.code").value("last-admin"));
    }
  }

  @Nested
  class Signing_out_everywhere {

    @Test
    void ends_their_sessions_and_no_one_elses() throws Exception {
      owner.perform(post("/api/users/" + ada.id() + "/sign-out")).andExpect(status().isNoContent());

      ada.perform(get("/api/users/me")).andExpect(status().isUnauthorized());
      owner.perform(get("/api/users/me")).andExpect(status().isOk());
    }

    @Test
    void an_unknown_user_is_not_found() throws Exception {
      owner
          .perform(post("/api/users/" + UUID.randomUUID() + "/sign-out"))
          .andExpect(status().isNotFound());
    }
  }
}
