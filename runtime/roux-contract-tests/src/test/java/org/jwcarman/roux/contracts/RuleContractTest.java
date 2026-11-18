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

import java.util.stream.Stream;

import jakarta.servlet.http.Cookie;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.web.servlet.MockMvc;

import tools.jackson.databind.JsonNode;

/**
 * The rules the browser's schemas and the server's request bodies share, held together by the
 * examples in {@code contracts/}: roux-web's {@code time()} reads the same fixture.
 */
@SpringBootTest(classes = ContractTestApplication.class)
@AutoConfigureMockMvc
class RuleContractTest {

  private static final JsonNode TIME = Fixtures.read("time.json");

  @Autowired MockMvc mvc;

  static Stream<String> validTimes() {
    return TIME.get("valid").valueStream().map(JsonNode::asString);
  }

  static Stream<String> invalidTimes() {
    return TIME.get("invalid").valueStream().map(JsonNode::asString);
  }

  @ParameterizedTest
  @MethodSource("validTimes")
  void aTimeTheBrowserAcceptsIsRead(String time) throws Exception {
    MockHttpServletResponse response =
        send("/api/contract/time", "{\"startsAt\":\"" + time + "\"}");

    assertThat(response.getStatus()).isEqualTo(200);
  }

  @ParameterizedTest
  @MethodSource("invalidTimes")
  void aTimeTheBrowserRefusesIsAFieldErrorWithTheContractsMessage(String time) throws Exception {
    MockHttpServletResponse response =
        send("/api/contract/time", "{\"startsAt\":\"" + time + "\"}");

    assertThat(response.getStatus()).isEqualTo(400);
    JsonNode error = Fixtures.parse(response.getContentAsString()).get("errors").get(0);
    assertThat(error.get("field").asString()).isEqualTo("startsAt");
    assertThat(error.get("message").asString()).isEqualTo(TIME.get("message").asString());
  }

  /** POSTs {@code json} as a signed-in user, with the CSRF token a browser would send. */
  MockHttpServletResponse send(String path, String json) throws Exception {
    Cookie cookie = mvc.perform(get("/who/me")).andReturn().getResponse().getCookie("XSRF-TOKEN");
    return mvc.perform(
            post(path)
                .with(SecurityMockMvcRequestPostProcessors.user("ada"))
                .cookie(cookie)
                .header("X-XSRF-TOKEN", cookie.getValue())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json))
        .andReturn()
        .getResponse();
  }
}
