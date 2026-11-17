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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

/** {@code roux.spa.enabled=false} leaves page URLs to the application. */
@SpringBootTest(classes = SpaTestApplication.class)
@AutoConfigureMockMvc
@TestPropertySource(properties = "roux.spa.enabled=false")
class SpaDisabledMvcTest {

  @Autowired MockMvc mvc;
  @Autowired ApplicationContext context;

  @Test
  void a_page_url_is_not_the_shell() throws Exception {
    mvc.perform(get("/settings").accept(MediaType.TEXT_HTML).with(user("tester")))
        .andExpect(status().isNotFound());
  }

  @Test
  void nothing_of_it_is_registered() {
    assertThat(context.containsBean("spaFallbackFilter")).isFalse();
    assertThat(context.getBeanNamesForType(RouxSpaProperties.class)).isEmpty();
  }
}
