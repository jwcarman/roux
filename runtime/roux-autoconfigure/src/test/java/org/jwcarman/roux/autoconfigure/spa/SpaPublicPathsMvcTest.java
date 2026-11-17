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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.jwcarman.who.spring.security.WhoPublicPathContributor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/**
 * The shell and the assets are contributed, so an app's own {@code who.security.public-paths} and
 * another contributor's paths are public beside them, and everything else still needs a sign-in.
 */
@DisplayNameGeneration(ReplaceUnderscores.class)
@SpringBootTest(classes = SpaTestApplication.class)
@AutoConfigureMockMvc
@Import(SpaPublicPathsMvcTest.AnotherContributor.class)
@TestPropertySource(properties = "who.security.public-paths=/mine.txt")
class SpaPublicPathsMvcTest {

  @TestConfiguration(proxyBeanMethods = false)
  static class AnotherContributor {

    @Bean
    WhoPublicPathContributor anotherContributor() {
      return () -> List.of("/humans.txt");
    }
  }

  @Autowired MockMvc mvc;

  @Test
  void the_shell_is_public() throws Exception {
    mvc.perform(get("/index.html").accept(MediaType.TEXT_HTML))
        .andExpect(status().isOk())
        .andExpect(content().string(containsString("<div id=\"root\"></div>")));
  }

  @Test
  void the_apps_own_public_path_still_applies() throws Exception {
    mvc.perform(get("/mine.txt")).andExpect(status().isNotFound());
  }

  @Test
  void another_contributors_path_still_applies() throws Exception {
    mvc.perform(get("/humans.txt")).andExpect(status().isNotFound());
  }

  @Test
  void any_other_path_needs_a_sign_in() throws Exception {
    mvc.perform(get("/private.txt")).andExpect(status().isUnauthorized());
  }
}
