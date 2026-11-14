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

import jakarta.servlet.http.Cookie;

import org.junit.jupiter.api.Test;
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
class SessionContractTest {

  private static final JsonNode SESSION = Fixtures.read("session.json");
  private static final String CSRF_COOKIE = SESSION.get("csrfCookie").asString();
  private static final String CSRF_HEADER = SESSION.get("csrfHeader").asString();

  @Autowired MockMvc mvc;

  @Test
  void bootstrapSetsCsrfCookie() throws Exception {
    assertThat(bootstrapCookie()).isNotNull();
  }

  @Test
  void postWithoutHeaderIsRefused() throws Exception {
    Cookie cookie = bootstrapCookie();

    int status = mvc.perform(echo().cookie(cookie)).andReturn().getResponse().getStatus();

    assertThat(status).isEqualTo(403);
  }

  @Test
  void postWithHeaderIsAccepted() throws Exception {
    Cookie cookie = bootstrapCookie();

    int status =
        mvc.perform(echo().cookie(cookie).header(CSRF_HEADER, cookie.getValue()))
            .andReturn()
            .getResponse()
            .getStatus();

    assertThat(status).isEqualTo(200);
  }

  @Test
  void signedOutApiCallIsSessionLost() throws Exception {
    int status = mvc.perform(get("/api/contract/page")).andReturn().getResponse().getStatus();

    assertThat(status).isEqualTo(SESSION.get("sessionLostStatus").asInt());
  }

  private Cookie bootstrapCookie() throws Exception {
    MockHttpServletResponse response =
        mvc.perform(get(SESSION.get("csrfBootstrapPath").asString())).andReturn().getResponse();
    return response.getCookie(CSRF_COOKIE);
  }

  private static MockHttpServletRequestBuilder echo() {
    return post(SESSION.get("sessionPathPrefix").asString() + "contract/echo")
        .with(SecurityMockMvcRequestPostProcessors.user("ada"))
        .contentType(MediaType.APPLICATION_JSON)
        .content("{}");
  }
}
