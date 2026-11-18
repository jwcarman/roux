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

  private static final JsonNode AFTER = Fixtures.read("after.json");

  @Autowired MockMvc mvc;

  /** One example of {@code after.json}: the two values, and whether the rule accepts them. */
  record AfterExample(String kind, String start, String end, boolean valid) {}

  static Stream<AfterExample> afterExamples() {
    return Stream.of("time", "date")
        .flatMap(
            kind ->
                Stream.concat(
                    AFTER
                        .get(kind)
                        .get("valid")
                        .valueStream()
                        .map(pair -> example(kind, pair, true)),
                    AFTER
                        .get(kind)
                        .get("invalid")
                        .valueStream()
                        .map(pair -> example(kind, pair, false))));
  }

  private static AfterExample example(String kind, JsonNode pair, boolean valid) {
    return new AfterExample(kind, pair.get(0).asString(), pair.get(1).asString(), valid);
  }

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

  @ParameterizedTest
  @MethodSource("afterExamples")
  void theLaterFieldIsAFieldErrorWithTheContractsMessageExactlyWhenTheBrowserSaysSo(
      AfterExample example) throws Exception {
    JsonNode rule = AFTER.get(example.kind());
    String json =
        "{\"%s\":\"%s\",\"%s\":\"%s\"}"
            .formatted(
                rule.get("other").asString(),
                example.start(),
                rule.get("field").asString(),
                example.end());

    MockHttpServletResponse response = send("/api/contract/after-" + example.kind(), json);

    if (example.valid()) {
      assertThat(response.getStatus()).isEqualTo(200);
    } else {
      assertThat(response.getStatus()).isEqualTo(400);
      JsonNode errors = Fixtures.parse(response.getContentAsString()).get("errors");
      assertThat(errors.size()).isEqualTo(1);
      assertThat(errors.get(0).get("field").asString()).isEqualTo(rule.get("field").asString());
      assertThat(errors.get(0).get("message").asString()).isEqualTo(rule.get("message").asString());
    }
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
