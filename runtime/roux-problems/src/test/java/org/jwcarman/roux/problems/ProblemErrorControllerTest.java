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

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import jakarta.servlet.Filter;
import jakarta.servlet.http.HttpServletResponse;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.core.Ordered;

/** A response that reaches /error, such as a sendError from a filter, over a real port. */
@SpringBootTest(
    classes = ProblemsTestApplication.class,
    webEnvironment = WebEnvironment.RANDOM_PORT)
@Import(ProblemErrorControllerTest.SendErrorFilter.class)
class ProblemErrorControllerTest {

  static final String PATH = "/api/test/send-error";

  @TestConfiguration
  static class SendErrorFilter {
    @Bean
    FilterRegistrationBean<Filter> sendError() {
      FilterRegistrationBean<Filter> registration =
          new FilterRegistrationBean<>(
              (request, response, chain) -> ((HttpServletResponse) response).sendError(401));
      registration.addUrlPatterns(PATH);
      registration.setOrder(Ordered.HIGHEST_PRECEDENCE);
      return registration;
    }
  }

  @LocalServerPort int port;

  private HttpResponse<String> get(String accept) throws Exception {
    return HttpClient.newHttpClient()
        .send(
            HttpRequest.newBuilder(URI.create("http://localhost:" + port + PATH))
                .header("Accept", accept)
                .build(),
            HttpResponse.BodyHandlers.ofString());
  }

  @Test
  void jsonErrorsAreProblems() throws Exception {
    HttpResponse<String> response = get("application/json");
    assertThat(response.statusCode()).isEqualTo(401);
    assertThat(response.headers().firstValue("Content-Type"))
        .hasValueSatisfying(type -> assertThat(type).startsWith("application/problem+json"));
    assertThat(response.body())
        .contains("\"title\":\"Unauthorized\"")
        .contains("\"instance\":\"" + PATH + "\"");
  }

  @Test
  void htmlErrorsKeepBootsPage() throws Exception {
    HttpResponse<String> response = get("text/html");
    assertThat(response.statusCode()).isEqualTo(401);
    assertThat(response.headers().firstValue("Content-Type"))
        .hasValueSatisfying(type -> assertThat(type).startsWith("text/html"));
  }

  private HttpResponse<String> get(String path, String accept) throws Exception {
    return HttpClient.newHttpClient()
        .send(
            HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header("Accept", accept)
                .build(),
            HttpResponse.BodyHandlers.ofString());
  }

  @Test
  void aMissingApiPathIsAProblem() throws Exception {
    HttpResponse<String> response = get("/api/no-such-thing", "application/json");
    assertThat(response.statusCode()).isIn(401, 404);
    assertThat(response.headers().firstValue("Content-Type"))
        .hasValueSatisfying(type -> assertThat(type).startsWith("application/problem+json"));
  }

  @Test
  void anyClientThatAcceptsAnythingGetsAProblem() throws Exception {
    // curl and most HTTP clients send */*, or no Accept at all
    for (String accept : new String[] {"*/*", ""}) {
      HttpRequest.Builder request =
          HttpRequest.newBuilder(URI.create("http://localhost:" + port + PATH));
      if (!accept.isEmpty()) {
        request.header("Accept", accept);
      }
      HttpResponse<String> response =
          HttpClient.newHttpClient().send(request.build(), HttpResponse.BodyHandlers.ofString());
      assertThat(response.statusCode()).isEqualTo(401);
      assertThat(response.headers().firstValue("Content-Type"))
          .hasValueSatisfying(type -> assertThat(type).startsWith("application/problem+json"));
      assertThat(response.body()).contains("\"title\":\"Unauthorized\"");
    }
  }
}
