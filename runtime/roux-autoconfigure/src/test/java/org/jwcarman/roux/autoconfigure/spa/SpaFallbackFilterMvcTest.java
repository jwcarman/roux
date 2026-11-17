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
package org.jwcarman.roux.autoconfigure.spa;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/** A running application serves its shell for any page URL, and only for one. */
@DisplayNameGeneration(ReplaceUnderscores.class)
@SpringBootTest(classes = SpaTestApplication.class)
@AutoConfigureMockMvc
@TestPropertySource(properties = "roux.spa.excluded-paths=/legacy/**")
class SpaFallbackFilterMvcTest {

  private static final String SHELL = "<div id=\"root\"></div>";

  @Autowired MockMvc mvc;

  @Nested
  class A_page_request {

    @Test
    void for_a_deep_path_gets_the_shell_signed_out() throws Exception {
      mvc.perform(get("/members/0190c1de").accept(MediaType.TEXT_HTML))
          .andExpect(status().isOk())
          .andExpect(content().string(containsString(SHELL)));
    }

    @Test
    void for_the_root_gets_the_shell() throws Exception {
      mvc.perform(get("/").accept(MediaType.TEXT_HTML))
          .andExpect(status().isOk())
          .andExpect(content().string(containsString(SHELL)));
    }

    @Test
    void for_a_page_no_one_wrote_gets_the_shell_too() throws Exception {
      mvc.perform(get("/no/such/page").accept(MediaType.TEXT_HTML))
          .andExpect(status().isOk())
          .andExpect(content().string(containsString(SHELL)));
    }

    @Test
    void by_a_browser_that_also_accepts_anything_gets_the_shell() throws Exception {
      mvc.perform(get("/settings").header("Accept", "text/html,application/xhtml+xml,*/*;q=0.8"))
          .andExpect(status().isOk())
          .andExpect(content().string(containsString(SHELL)));
    }

    @Test
    void by_head_is_answered_without_a_body() throws Exception {
      mvc.perform(head("/settings").accept(MediaType.TEXT_HTML))
          .andExpect(status().isOk())
          .andExpect(content().string(""));
    }

    @Test
    void is_served_the_shell_a_direct_request_for_it_would_be() throws Exception {
      mvc.perform(get("/settings").accept(MediaType.TEXT_HTML))
          .andExpect(content().string(containsString(SHELL)))
          .andExpect(header().string("Content-Type", startsWith("text/html")));
    }
  }

  @Nested
  class A_request_that_is_not_for_a_page {

    @Test
    void for_json_is_not_the_shell() throws Exception {
      mvc.perform(get("/settings").accept(MediaType.APPLICATION_JSON).with(user("tester")))
          .andExpect(status().isNotFound())
          .andExpect(content().string(not(containsString(SHELL))));
    }

    @Test
    void with_no_accept_header_is_not_the_shell() throws Exception {
      mvc.perform(get("/settings").with(user("tester"))).andExpect(status().isNotFound());
    }

    @Test
    void accepting_anything_is_not_the_shell() throws Exception {
      mvc.perform(get("/settings").accept(MediaType.ALL).with(user("tester")))
          .andExpect(status().isNotFound());
    }

    @Test
    void with_an_unreadable_accept_header_is_not_the_shell() throws Exception {
      mvc.perform(get("/settings").header("Accept", "not a media type").with(user("tester")))
          .andExpect(status().isNotFound());
    }

    @Test
    void for_a_file_is_not_the_shell() throws Exception {
      mvc.perform(get("/missing.png").accept(MediaType.TEXT_HTML).with(user("tester")))
          .andExpect(status().isNotFound());
    }

    @Test
    void for_a_file_that_exists_gets_the_file() throws Exception {
      mvc.perform(get("/robots.txt").accept(MediaType.TEXT_HTML).with(user("tester")))
          .andExpect(content().string(containsString("plain")));
    }

    @Test
    void by_post_is_not_the_shell() throws Exception {
      mvc.perform(post("/settings").accept(MediaType.TEXT_HTML).with(user("tester")))
          .andExpect(status().is4xxClientError())
          .andExpect(content().string(not(containsString(SHELL))));
    }

    @Test
    void under_an_excluded_path_is_not_the_shell() throws Exception {
      mvc.perform(get("/legacy/report").accept(MediaType.TEXT_HTML).with(user("tester")))
          .andExpect(status().isOk())
          .andExpect(content().string("a server-rendered page"));
    }
  }

  @Nested
  class The_api {

    @Test
    void answers_a_missing_endpoint_with_a_problem_not_the_shell() throws Exception {
      mvc.perform(get("/api/missing").accept(MediaType.TEXT_HTML).with(user("tester")))
          .andExpect(status().isNotFound())
          .andExpect(header().string("Content-Type", startsWith("application/problem+json")))
          .andExpect(jsonPath("$.status").value(404));
    }

    @Test
    void still_answers_its_endpoints() throws Exception {
      mvc.perform(get("/api/ping").accept(MediaType.TEXT_HTML).with(user("tester")))
          .andExpect(content().string("pong"));
    }

    @Test
    void needs_a_signed_in_caller() throws Exception {
      mvc.perform(get("/api/ping").accept(MediaType.TEXT_HTML))
          .andExpect(status().isUnauthorized());
    }

    @Test
    void is_not_opened_by_the_shell() throws Exception {
      mvc.perform(get("/api/missing").accept(MediaType.TEXT_HTML))
          .andExpect(status().isUnauthorized());
    }
  }

  @Nested
  class The_hashed_assets {

    @Test
    void are_cached_for_a_year_and_never_change() throws Exception {
      mvc.perform(get("/assets/app-abc123.js"))
          .andExpect(status().isOk())
          .andExpect(header().string("Cache-Control", "max-age=31536000, public, immutable"));
    }

    @Test
    void load_signed_out() throws Exception {
      mvc.perform(get("/assets/app-abc123.js").accept(MediaType.TEXT_HTML))
          .andExpect(status().isOk())
          .andExpect(content().string(containsString("app")));
    }

    @Test
    void that_do_not_exist_are_not_the_shell() throws Exception {
      mvc.perform(get("/assets/nope").accept(MediaType.TEXT_HTML)).andExpect(status().isNotFound());
    }
  }

  @Test
  void the_shell_itself_loads_signed_out() throws Exception {
    mvc.perform(get("/index.html")).andExpect(status().isOk());
  }
}
