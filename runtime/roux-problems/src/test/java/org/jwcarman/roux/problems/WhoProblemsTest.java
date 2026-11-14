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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

/** who hands its errors to the app, which answers them as Problem Details. */
@SpringBootTest(classes = ProblemsTestApplication.class)
@AutoConfigureMockMvc
@Import(LibraryErrorsTestController.class)
class WhoProblemsTest {

  @Autowired MockMvc mvc;

  @Test
  void signInFailureIsNotGenericSignIn() throws Exception {
    ProblemsAdviceTest.isProblem(
            mvc.perform(get("/api/test/libraries/sign-in-failed")), 401, "Unauthorized")
        .andExpect(jsonPath("$.detail").value("Sign-in failed"))
        .andExpect(content().string(not(containsString("invalid_token"))));
  }

  @Test
  void reauthenticationIsNotGenericSignIn() throws Exception {
    ProblemsAdviceTest.isProblem(
            mvc.perform(get("/api/test/libraries/reauthenticate")), 401, "Unauthorized")
        .andExpect(jsonPath("$.detail").value("Sign in again to continue"));
  }

  @Test
  void anInvalidPasskeyIs400() throws Exception {
    ProblemsAdviceTest.isProblem(
            mvc.perform(get("/api/test/libraries/passkey")), 400, "Bad Request")
        .andExpect(jsonPath("$.detail").value("The passkey could not be registered"));
  }
}
