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
package org.jwcarman.roux.spa;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.matchesPattern;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import tools.jackson.databind.json.JsonMapper;

@DisplayNameGeneration(ReplaceUnderscores.class)
class ShellRoutesTest {

  private final ShellPage page =
      new ShellPage(
          "<title>__APP_NAME__</title><i>__APP_THEME__</i><b nonce=\"__CSP_NONCE__\"></b>",
          ContentSecurityPolicy.strict(),
          () -> ShellTheme.stock("Dojo"),
          JsonMapper.builder().build());

  private final MockMvc mvc = MockMvcBuilders.routerFunctions(ShellRoutes.of(page)).build();

  @Test
  void the_shell_is_html_that_is_never_stored_with_its_own_policy() throws Exception {
    mvc.perform(get("/index.html"))
        .andExpect(status().isOk())
        .andExpect(header().string("Content-Type", "text/html;charset=UTF-8"))
        .andExpect(header().string("Cache-Control", "no-store"))
        .andExpect(
            header()
                .string(
                    "Content-Security-Policy",
                    matchesPattern(".*script-src 'self' 'nonce-[A-Za-z0-9+/]{22}==';.*")))
        .andExpect(content().string(containsString("<title>Dojo</title>")));
  }

  @Test
  void the_nonce_in_the_page_is_the_one_in_the_policy() throws Exception {
    var response = mvc.perform(get("/index.html")).andReturn().getResponse();

    String policy = response.getHeader("Content-Security-Policy");
    String nonce = policy.replaceAll(".*script-src 'self' 'nonce-([^']+)'.*", "$1");
    org.assertj.core.api.Assertions.assertThat(response.getContentAsString())
        .contains("<b nonce=\"" + nonce + "\">");
  }

  @Test
  void every_response_has_a_nonce_of_its_own() throws Exception {
    String first = mvc.perform(get("/index.html")).andReturn().getResponse().getContentAsString();
    String second = mvc.perform(get("/index.html")).andReturn().getResponse().getContentAsString();

    org.assertj.core.api.Assertions.assertThat(first).isNotEqualTo(second);
  }

  @Test
  void a_head_request_gets_the_same_headers() throws Exception {
    mvc.perform(head("/index.html"))
        .andExpect(status().isOk())
        .andExpect(header().string("Cache-Control", "no-store"))
        .andExpect(header().exists("Content-Security-Policy"))
        .andExpect(content().string(""));
  }

  @Test
  void nothing_else_is_the_shell() throws Exception {
    mvc.perform(post("/index.html")).andExpect(status().is4xxClientError());
    mvc.perform(get("/other")).andExpect(status().isNotFound());
  }
}
