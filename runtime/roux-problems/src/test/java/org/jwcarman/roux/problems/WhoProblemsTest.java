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
package org.jwcarman.roux.problems;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/** who's exceptions on the app's own endpoints answer as Problem Details in who's shape. */
@SpringBootTest(classes = ProblemsTestApplication.class)
@AutoConfigureMockMvc
@Import(LibraryErrorsTestController.class)
class WhoProblemsTest {

  @Autowired MockMvc mvc;

  @Test
  void signInFailureIsNotGenericSignIn() throws Exception {
    whoProblem(mvc.perform(get("/api/test/libraries/sign-in-failed")))
        .andExpect(jsonPath("$.detail").value("Sign-in failed"))
        .andExpect(jsonPath("$.type").value("urn:who:error:sign-in-failed"))
        .andExpect(jsonPath("$.code").value("sign-in-failed"))
        .andExpect(content().string(not(containsString("invalid_token"))));
  }

  @Test
  void reauthenticationIsNotGenericSignIn() throws Exception {
    whoProblem(mvc.perform(get("/api/test/libraries/reauthenticate")))
        .andExpect(jsonPath("$.detail").value("Sign in again to continue"))
        .andExpect(jsonPath("$.type").value("urn:who:error:reauthentication-required"))
        .andExpect(jsonPath("$.code").value("reauthentication-required"));
  }

  /** A 401 Problem Detail with a {@code type} of its own, which who's own answers have too. */
  private static ResultActions whoProblem(ResultActions result) throws Exception {
    return result
        .andExpect(status().isUnauthorized())
        .andExpect(header().string("Content-Type", startsWith("application/problem+json")))
        .andExpect(jsonPath("$.title").value("Unauthorized"))
        .andExpect(jsonPath("$.status").value(401));
  }
}
