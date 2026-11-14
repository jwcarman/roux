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

import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.web.servlet.MockMvc;

import tools.jackson.databind.JsonNode;

@SpringBootTest(classes = ContractTestApplication.class)
@AutoConfigureMockMvc
class PageContractTest {

  @Autowired MockMvc mvc;

  @Test
  void pageMatchesFixture() throws Exception {
    String body =
        mvc.perform(
                get("/api/contract/page?pageIndex=0&pageSize=2")
                    .with(SecurityMockMvcRequestPostProcessors.user("ada")))
            .andReturn()
            .getResponse()
            .getContentAsString();

    assertThat(Fixtures.parse(body)).isEqualTo(Fixtures.read("page.json"));
  }

  static Stream<JsonNode> pageParams() {
    return Fixtures.read("page-params.json").valueStream();
  }

  @ParameterizedTest
  @MethodSource("pageParams")
  void paramsBind(JsonNode entry) throws Exception {
    String body =
        mvc.perform(
                get("/api/contract/echo-params" + entry.get("query").asString())
                    .with(SecurityMockMvcRequestPostProcessors.user("ada")))
            .andReturn()
            .getResponse()
            .getContentAsString();

    JsonNode bound = Fixtures.parse(body);
    for (String name : new String[] {"pageIndex", "pageSize", "sortBy", "sortDirection"}) {
      assertThat(bound.get(name)).as(name).isEqualTo(entry.get(name));
    }
  }
}
