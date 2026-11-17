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

import java.util.List;

import jakarta.servlet.http.HttpServletRequest;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

@DisplayNameGeneration(ReplaceUnderscores.class)
class SpaFallbackFilterTest {

  private final SpaFallbackFilter filter = new SpaFallbackFilter(List.of("/legacy/**"));

  private HttpServletRequest seenBy(MockHttpServletRequest request) throws Exception {
    MockFilterChain chain = new MockFilterChain();
    filter.doFilter(request, new MockHttpServletResponse(), chain);
    return (HttpServletRequest) chain.getRequest();
  }

  private static MockHttpServletRequest page(String path) {
    MockHttpServletRequest request = new MockHttpServletRequest("GET", path);
    request.addHeader("Accept", "text/html");
    return request;
  }

  @Test
  void a_page_request_is_presented_as_a_request_for_the_shell() throws Exception {
    MockHttpServletRequest original = page("/app/members/7");
    original.setContextPath("/app");
    original.setServerName("example.test");
    original.setServerPort(80);

    HttpServletRequest seen = seenBy(original);

    assertThat(seen.getRequestURI()).isEqualTo("/app/index.html");
    assertThat(seen.getRequestURL()).hasToString("http://example.test/app/index.html");
    assertThat(seen.getServletPath()).isEqualTo("/index.html");
    assertThat(seen.getPathInfo()).isNull();
    assertThat(seen.getMethod()).isEqualTo("GET");
  }

  @Test
  void a_request_that_is_not_for_a_page_passes_untouched() throws Exception {
    MockHttpServletRequest api = page("/api/members");

    assertThat(seenBy(api)).isSameAs(api);
  }

  @Test
  void every_default_exclusion_passes_untouched() throws Exception {
    for (String path :
        List.of(
            "/api",
            "/api/x",
            "/who/me",
            "/assets/x",
            "/actuator/health",
            "/.well-known/x",
            "/error",
            "/legacy/x")) {
      MockHttpServletRequest request = page(path);
      assertThat(seenBy(request)).as(path).isSameAs(request);
    }
  }

  @Test
  void a_path_that_only_starts_like_an_exclusion_is_a_page() throws Exception {
    for (String path : List.of("/apiary", "/errors", "/whom", "/legacies")) {
      assertThat(seenBy(page(path)).getRequestURI()).as(path).isEqualTo("/index.html");
    }
  }

  @Test
  void a_dot_in_an_earlier_segment_is_not_a_file_extension() throws Exception {
    assertThat(seenBy(page("/v1.2/members")).getRequestURI()).isEqualTo("/index.html");
    MockHttpServletRequest hidden = page("/.env");
    assertThat(seenBy(hidden)).isSameAs(hidden);
    MockHttpServletRequest file = page("/members/photo.png");
    assertThat(seenBy(file)).isSameAs(file);
  }

  @Test
  void head_is_a_page_request_and_post_is_not() throws Exception {
    MockHttpServletRequest head = new MockHttpServletRequest("HEAD", "/settings");
    head.addHeader("Accept", "text/html");
    assertThat(seenBy(head).getRequestURI()).isEqualTo("/index.html");

    MockHttpServletRequest post = new MockHttpServletRequest("POST", "/settings");
    post.addHeader("Accept", "text/html");
    assertThat(seenBy(post)).isSameAs(post);
    MockHttpServletRequest put = new MockHttpServletRequest("PUT", "/settings");
    put.addHeader("Accept", "text/html");
    assertThat(seenBy(put)).isSameAs(put);
  }

  @Test
  void accept_must_name_html() throws Exception {
    MockHttpServletRequest none = new MockHttpServletRequest("GET", "/settings");
    assertThat(seenBy(none)).isSameAs(none);

    MockHttpServletRequest any = new MockHttpServletRequest("GET", "/settings");
    any.addHeader("Accept", "*/*");
    assertThat(seenBy(any)).isSameAs(any);

    MockHttpServletRequest json = new MockHttpServletRequest("GET", "/settings");
    json.addHeader("Accept", "application/json");
    assertThat(seenBy(json)).isSameAs(json);

    MockHttpServletRequest broken = new MockHttpServletRequest("GET", "/settings");
    broken.addHeader("Accept", "//");
    assertThat(seenBy(broken)).isSameAs(broken);

    MockHttpServletRequest browser = new MockHttpServletRequest("GET", "/settings");
    browser.addHeader("Accept", "application/xhtml+xml, text/html;q=0.9, */*;q=0.8");
    assertThat(seenBy(browser).getRequestURI()).isEqualTo("/index.html");
  }
}
