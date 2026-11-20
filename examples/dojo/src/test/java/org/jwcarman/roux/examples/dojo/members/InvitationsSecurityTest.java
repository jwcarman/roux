package org.jwcarman.roux.examples.dojo.members;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.examples.dojo.identity.Roles;
import org.jwcarman.roux.roles.RouxRoles;
import org.jwcarman.roux.test.AppTest;
import org.jwcarman.roux.test.TestUser;
import org.jwcarman.roux.test.TestUsers;
import org.jwcarman.who.core.domain.Identity;
import org.jwcarman.who.core.service.WhoService;
import org.jwcarman.who.emaillink.EmailCredential;
import org.jwcarman.who.emaillink.EmailCredentialService;
import org.jwcarman.who.test.WhoMockMvcBrowser;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/** The protected-API security rules, proved against the one permission-gated endpoint. */
@AppTest
class InvitationsSecurityTest {

  private static final String INVITE = "/api/members/invitations";
  private static final String BODY = "{\"name\":\"New Member\",\"email\":\"new@example.com\"}";

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired TestUsers users;
  @Autowired WhoService who;
  @Autowired EmailCredentialService emailCredentials;

  @BeforeEach
  void cleanSlate() {
    users.reset();
  }

  @Test
  void memberWithoutMembersInviteIs403() throws Exception {
    users
        .signedIn("Alice", "alice@example.com", Roles.MEMBER)
        .perform(post(INVITE).contentType(MediaType.APPLICATION_JSON).content(BODY))
        .andExpect(status().isForbidden());
  }

  @Test
  void signedInCallerWithNoRoleIs403() throws Exception {
    Identity identity = who.createIdentity();
    EmailCredential credential = emailCredentials.register(identity, "norole@example.com");
    WhoMockMvcBrowser roleless =
        new WhoMockMvcBrowser(mvc).signedInAs(identity.id(), credential.id());

    roleless
        .perform(post(INVITE).contentType(MediaType.APPLICATION_JSON).content(BODY))
        .andExpect(status().isForbidden());
  }

  @Test
  void inviteNameIsValidated() throws Exception {
    TestUser owner = users.signedIn("Bo Boss", "boss@example.com", RouxRoles.OWNER);

    for (String name : List.of("   ", "a".repeat(81))) {
      owner
          .perform(
              post(INVITE)
                  .contentType(MediaType.APPLICATION_JSON)
                  .content("{\"name\":\"" + name + "\",\"email\":\"ada@example.org\"}"))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.errors[?(@.field == \'name\')]").isNotEmpty());
    }
    owner
        .perform(
            post(INVITE)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"ada@example.org\"}"))
        .andExpect(status().isBadRequest());
    owner
        .perform(
            post(INVITE)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\" Ada \",\"email\":\"ada@example.org\"}"))
        .andExpect(status().isAccepted());
    assertThat(
            jdbc.queryForObject(
                "select display_name from member_profile where email = ?",
                String.class,
                "ada@example.org"))
        .isEqualTo("Ada");
  }

  @Test
  void postWithoutCsrfHeaderIs403() throws Exception {
    TestUser owner = users.signedIn("Bo Boss", "boss@example.com", RouxRoles.OWNER);

    // WhoMockMvcBrowser always echoes the CSRF cookie into the header, so send the request with
    // only the browser's session cookie.
    mvc.perform(
            post(INVITE)
                .cookie(owner.browser().cookie("SESSION").orElseThrow())
                .contentType(MediaType.APPLICATION_JSON)
                .content(BODY))
        .andExpect(status().isForbidden());
  }
}
