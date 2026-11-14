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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(classes = ProblemsTestApplication.class)
@AutoConfigureMockMvc
@Import(LibraryErrorsTestController.class)
class PagingProblemsTest {

  @Autowired MockMvc mvc;

  @Test
  void anUnknownSortByIsAnInvalidField() throws Exception {
    ProblemsAdviceTest.isProblem(
            mvc.perform(get("/api/test/libraries/unknown-sort")), 400, "Bad Request")
        .andExpect(jsonPath("$.detail").value("The request has invalid fields"))
        .andExpect(jsonPath("$.errors.length()").value(1))
        .andExpect(jsonPath("$.errors[0].field").value("sortBy"))
        .andExpect(jsonPath("$.errors[0].message").isNotEmpty());
  }
}
