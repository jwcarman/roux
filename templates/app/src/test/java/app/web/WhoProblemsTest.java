package app.web;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.test.AppTest;
import org.jwcarman.roux.test.TestUser;
import org.jwcarman.roux.test.TestUsers;
import org.jwcarman.who.rbac.RbacService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

/** who answers its own errors under /who; the app answers the rest. */
@AppTest
class WhoProblemsTest {

  @Autowired TestUsers users;
  @Autowired RbacService rbac;

  @BeforeEach
  void cleanSlate() {
    users.reset();
  }

  @Test
  void signedOutApiRequestIs401Problem() throws Exception {
    AppProblemsTest.isProblem(users.anonymous().perform(get("/api/users")), 401, "Unauthorized")
        .andExpect(jsonPath("$.detail").value("Sign in to continue"));
  }

  @Test
  void whoMeSignedOutIs401Problem() throws Exception {
    whoProblem(users.anonymous().perform(get("/who/me")), "not-signed-in");
  }

  @Test
  void failedSignInIs401Problem() throws Exception {
    whoProblem(
            users
                .anonymous()
                .perform(
                    post("/who/email/sign-in")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"" + "x".repeat(43) + "\"}")),
            "sign-in-failed")
        .andExpect(jsonPath("$.detail").value("Sign-in failed"))
        .andExpect(content().string(not(containsString("invalid_token"))));
  }

  /** Under /who, who answers: type urn:who:error:code, and the code, in one Problem Detail. */
  private static ResultActions whoProblem(ResultActions result, String code) throws Exception {
    return result
        .andExpect(status().isUnauthorized())
        .andExpect(header().string("Content-Type", startsWith("application/problem+json")))
        .andExpect(jsonPath("$.type").value("urn:who:error:" + code))
        .andExpect(jsonPath("$.title").value("Unauthorized"))
        .andExpect(jsonPath("$.status").value(401))
        .andExpect(jsonPath("$.code").value(code));
  }

  @Test
  void deniedSplitsAnonymousFromSignedIn() throws Exception {
    TestUser carl = users.signedIn("Carl", "carl@example.com", rbac.createRole("CUSTOMER"));
    AppProblemsTest.isProblem(carl.perform(get("/api/users")), 403, "Forbidden")
        .andExpect(jsonPath("$.detail").value("You do not have permission"));
  }
}
