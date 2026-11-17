package org.jwcarman.roux.examples.dojo.web;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.examples.dojo.AppTest;
import org.jwcarman.roux.examples.dojo.TestMember;
import org.jwcarman.roux.examples.dojo.TestMembers;
import org.jwcarman.who.rbac.RbacService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

/** who 0.14 hands its errors to the app, which answers them as Problem Details. */
@AppTest
class WhoProblemsTest {

  @Autowired TestMembers members;
  @Autowired RbacService rbac;

  @BeforeEach
  void cleanSlate() {
    members.reset();
  }

  @Test
  void signedOutApiRequestIs401Problem() throws Exception {
    AppProblemsTest.isProblem(members.anonymous().perform(get("/api/members")), 401, "Unauthorized")
        .andExpect(jsonPath("$.detail").value("Sign in to continue"));
  }

  @Test
  void whoMeSignedOutIs401Problem() throws Exception {
    AppProblemsTest.isProblem(members.anonymous().perform(get("/who/me")), 401, "Unauthorized")
        .andExpect(jsonPath("$.detail").value("Sign in to continue"));
  }

  @Test
  void failedSignInIs401Problem() throws Exception {
    AppProblemsTest.isProblem(
            members
                .anonymous()
                .perform(
                    post("/who/email/sign-in")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"" + "x".repeat(43) + "\"}")),
            401,
            "Unauthorized")
        .andExpect(jsonPath("$.detail").value("Sign-in failed"))
        .andExpect(content().string(not(containsString("invalid_token"))));
  }

  @Test
  void deniedSplitsAnonymousFromSignedIn() throws Exception {
    TestMember carl = members.signedIn("Carl", "carl@example.com", rbac.createRole("CUSTOMER"));
    AppProblemsTest.isProblem(carl.perform(get("/api/members")), 403, "Forbidden")
        .andExpect(jsonPath("$.detail").value("You do not have permission"));
  }
}
