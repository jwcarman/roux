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

import java.util.UUID;

import jakarta.servlet.http.Cookie;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import tools.jackson.databind.JsonNode;

@SpringBootTest(classes = ContractTestApplication.class)
@AutoConfigureMockMvc
class ProblemContractTest {

  @Autowired MockMvc mvc;

  @ParameterizedTest
  @CsvSource({
    "problem-not-found.json,GET,/api/contract/not-found",
    "problem-invalid-fields.json,POST,/api/contract/invalid-fields",
    "problem-invariant.json,GET,/api/contract/invariant",
    "problem-conflict.json,GET,/api/contract/conflict",
    "problem-server-error.json,GET,/api/contract/server-error",
    "problem-unknown-sort.json,GET,/api/contract/page?sortBy=nope"
  })
  void responseMatchesFixture(String fixture, String method, String path) throws Exception {
    JsonNode expected = Fixtures.read(fixture);

    MockHttpServletResponse response = mvc.perform(request(method, path)).andReturn().getResponse();

    assertThat(response.getStatus()).isEqualTo(expected.get("status").asInt());
    assertThat(response.getContentType()).startsWith("application/problem+json");
    JsonNode actual = Fixtures.parse(response.getContentAsString());
    assertThat(actual.propertyNames())
        .containsExactlyInAnyOrderElementsOf(expected.propertyNames());
    expected
        .propertyNames()
        .forEach(
            name -> {
              if (expected.get(name).isString() && "<uuid>".equals(expected.get(name).asString())) {
                assertThat(UUID.fromString(actual.get(name).asString())).isNotNull();
              } else {
                assertThat(actual.get(name)).isEqualTo(expected.get(name));
              }
            });
  }

  /**
   * who answers its own errors under its base path as Problem Details: the members roux-web's
   * {@code problemOf} reads (type, title, status, detail), and who's {@code code}. roux's advices
   * do not touch it, so a client sees one shape.
   */
  @Test
  void whoAnswersItsOwnErrorsAsProblemDetails() throws Exception {
    MockHttpServletResponse response = mvc.perform(get("/who/me")).andReturn().getResponse();

    assertThat(response.getStatus()).isEqualTo(401);
    assertThat(response.getContentType()).startsWith("application/problem+json");
    JsonNode body = Fixtures.parse(response.getContentAsString());
    assertThat(body.get("type").asString()).isEqualTo("urn:who:error:not-signed-in");
    assertThat(body.get("title").asString()).isEqualTo("Unauthorized");
    assertThat(body.get("status").asInt()).isEqualTo(401);
    assertThat(body.get("code").asString()).isEqualTo("not-signed-in");
    assertThat(body.get("detail").isString()).isTrue();
  }

  private MockHttpServletRequestBuilder request(String method, String path) throws Exception {
    return switch (method) {
      case "GET" -> get(path).with(SecurityMockMvcRequestPostProcessors.user("ada"));
      case "POST" -> {
        Cookie cookie =
            mvc.perform(get("/who/me")).andReturn().getResponse().getCookie("XSRF-TOKEN");
        yield post(path)
            .with(SecurityMockMvcRequestPostProcessors.user("ada"))
            .cookie(cookie)
            .header("X-XSRF-TOKEN", cookie.getValue())
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"title\":\"\"}");
      }
      default -> throw new IllegalArgumentException(method);
    };
  }
}
