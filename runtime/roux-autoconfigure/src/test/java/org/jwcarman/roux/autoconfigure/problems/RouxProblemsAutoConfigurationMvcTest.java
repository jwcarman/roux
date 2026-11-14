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
package org.jwcarman.roux.autoconfigure.problems;

import static org.hamcrest.Matchers.startsWith;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.jwcarman.jpa.pagination.UnknownSortByValueException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** The auto-configured advices answer a running application's errors, each in its turn. */
@SpringBootTest(classes = ProblemsAutoConfigurationTestApplication.class)
@AutoConfigureMockMvc
class RouxProblemsAutoConfigurationMvcTest {

  @Autowired MockMvc mvc;

  private ResultActions fetch(String path) throws Exception {
    return mvc.perform(get("/api/test/errors" + path).with(user("tester")));
  }

  private static ResultActions isProblem(ResultActions result, int status, String detail)
      throws Exception {
    return result
        .andExpect(status().is(status))
        .andExpect(header().string("Content-Type", startsWith("application/problem+json")))
        .andExpect(jsonPath("$.status").value(status))
        .andExpect(jsonPath("$.detail").value(detail));
  }

  @Test
  void rouxExceptionsAreProblems() throws Exception {
    isProblem(fetch("/not-found"), 404, "No such thing");
  }

  @Test
  void anythingElseIsAFiveHundred() throws Exception {
    isProblem(fetch("/broken"), 500, "Something went wrong");
  }

  @Test
  void securityErrorsAreProblems() throws Exception {
    isProblem(fetch("/denied"), 403, "You do not have permission");
  }

  @Test
  void whoAnswersAheadOfSecurity() throws Exception {
    // SignInFailedException is an AuthenticationException: after the security advice it would
    // answer as a plain "Sign in to continue"
    isProblem(fetch("/sign-in-failed"), 401, "Sign-in failed");
  }

  @Test
  void pagingErrorsAreFieldProblems() throws Exception {
    isProblem(fetch("/unknown-sort"), 400, "The request has invalid fields")
        .andExpect(jsonPath("$.errors[0].field").value("sortBy"))
        .andExpect(
            jsonPath("$.errors[0].message")
                .value(
                    new UnknownSortByValueException("bogus", new String[] {"name", "email"})
                        .getMessage()));
  }

  @Test
  void aMissingPathUnderTheDefaultPrefixIsAProblem() throws Exception {
    mvc.perform(get("/api/nothing").with(user("tester")))
        .andExpect(status().isNotFound())
        .andExpect(header().string("Content-Type", startsWith("application/problem+json")));
  }

  /** The prefix the advice is given is the one the application configured. */
  @Nested
  @TestPropertySource(properties = "roux.problems.api-path-prefix=/rest/")
  class WithACustomApiPathPrefix {

    @Test
    void aMissingPathUnderTheCustomPrefixIsAProblem() throws Exception {
      mvc.perform(get("/rest/nothing").with(user("tester")))
          .andExpect(status().isNotFound())
          .andExpect(header().string("Content-Type", startsWith("application/problem+json")));
    }

    @Test
    void aMissingPathOutsideItGoesOnToTheErrorPage() throws Exception {
      mvc.perform(get("/api/nothing").with(user("tester")).accept(MediaType.TEXT_HTML))
          .andExpect(status().isNotFound())
          .andExpect(header().doesNotExist("Content-Type"));
    }
  }
}
