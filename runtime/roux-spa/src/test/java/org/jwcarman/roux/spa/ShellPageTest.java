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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.time.Instant;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.Set;
import java.util.stream.IntStream;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.jwcarman.roux.organization.OrganizationContext;
import org.jwcarman.roux.organization.OrganizationContextSource;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.Resource;
import org.springframework.mock.web.MockHttpServletRequest;

import tools.jackson.databind.json.JsonMapper;

@DisplayNameGeneration(ReplaceUnderscores.class)
class ShellPageTest {

  private static final String TEMPLATE =
      "<title>__APP_NAME__</title><script type=\"application/json\" id=\"app-theme\">__APP_THEME__</script>"
          + "<script type=\"application/json\" id=\"app-context\">__APP_CONTEXT__</script>"
          + "<script nonce=\"__CSP_NONCE__\"></script><style nonce=\"__CSP_NONCE__\"></style>";

  private final JsonMapper json = JsonMapper.builder().build();

  private static final OrganizationContext CONTEXT =
      new OrganizationContext(
          "America/New_York",
          "en-US",
          LocalDate.parse("2026-11-20"),
          Instant.parse("2026-11-21T05:00:00Z"),
          "USD",
          2);

  private ShellPage page(ShellThemeSource source) {
    return new ShellPage(TEMPLATE, ContentSecurityPolicy.strict(), source, () -> CONTEXT, json);
  }

  private ShellPage page(OrganizationContextSource contexts) {
    return new ShellPage(
        TEMPLATE, ContentSecurityPolicy.strict(), () -> ShellTheme.stock("x"), contexts, json);
  }

  private ShellPage page(ShellTheme theme) {
    return page(() -> theme);
  }

  @Test
  void a_nonce_is_128_random_bits_in_base64() {
    Set<String> nonces = new HashSet<>();
    IntStream.range(0, 100).forEach(i -> nonces.add(ShellPage.nonce(new MockHttpServletRequest())));

    assertThat(nonces).hasSize(100).allMatch(nonce -> nonce.matches("[A-Za-z0-9+/]{22}=="));
  }

  @Test
  void a_request_keeps_one_nonce_for_its_header_and_its_page() {
    MockHttpServletRequest request = new MockHttpServletRequest();
    ShellPage page = page(ShellTheme.stock("Dojo"));

    String nonce = ShellPage.nonce(request);

    assertThat(page.policyFor(request)).contains("'nonce-" + nonce + "'");
    assertThat(page.render(request)).contains("<script nonce=\"" + nonce + "\">");
    assertThat(ShellPage.nonce(request)).isEqualTo(nonce);
  }

  @Test
  void every_nonce_placeholder_is_filled_with_the_requests_nonce() {
    MockHttpServletRequest request = new MockHttpServletRequest();

    String rendered = page(ShellTheme.stock("Dojo")).render(request);

    String nonce = ShellPage.nonce(request);
    assertThat(rendered)
        .contains("<script nonce=\"" + nonce + "\"></script><style nonce=\"" + nonce + "\">")
        .doesNotContain("__CSP_NONCE__");
  }

  @Test
  void the_name_is_the_title_and_the_theme_is_json() {
    String rendered =
        page(new ShellTheme("Dojo", "teal", "#ff8800", "round", "friendly", "modern"))
            .render(new MockHttpServletRequest());

    assertThat(rendered)
        .contains("<title>Dojo</title>")
        .contains(
            ">{\"appName\":\"Dojo\",\"palette\":\"teal\",\"brandColor\":\"#ff8800\","
                + "\"shape\":\"round\",\"headingFont\":\"friendly\",\"bodyFont\":\"modern\"}</script>");
  }

  @Test
  void writes_the_context_into_the_page() {
    assertThat(page(() -> CONTEXT).render(new MockHttpServletRequest()))
        .contains(
            "id=\"app-context\">{\"timeZone\":\"America/New_York\",\"locale\":\"en-US\","
                + "\"today\":\"2026-11-20\",\"todayEndsAt\":\"2026-11-21T05:00:00Z\","
                + "\"currency\":\"USD\",\"fractionDigits\":2}</script>");
  }

  @Test
  void the_context_is_read_for_every_page() {
    int[] reads = {0};
    ShellPage page =
        page(
            () ->
                new OrganizationContext(
                    "UTC", "en", LocalDate.EPOCH.plusDays(++reads[0]), Instant.EPOCH, null, null));

    assertThat(page.render(new MockHttpServletRequest())).contains("\"today\":\"1970-01-02\"");
    assertThat(page.render(new MockHttpServletRequest())).contains("\"today\":\"1970-01-03\"");
  }

  @Test
  void the_context_is_escaped() {
    String rendered =
        page(() ->
                new OrganizationContext(
                    "</script><script>x", "en", LocalDate.EPOCH, Instant.EPOCH, null, null))
            .render(new MockHttpServletRequest());

    assertThat(rendered).doesNotContain("</script><script>x").contains("\\u003c/script>");
  }

  @Test
  void a_placeholder_inside_the_context_is_not_filled_again() {
    String rendered =
        page(() ->
                new OrganizationContext(
                    "__APP_NAME__ __CSP_NONCE__", "en", LocalDate.EPOCH, Instant.EPOCH, null, null))
            .render(new MockHttpServletRequest());

    assertThat(rendered).contains("\"timeZone\":\"__APP_NAME__ __CSP_NONCE__\"");
  }

  @Test
  void a_source_with_no_context_fails_loudly() {
    ShellPage page = page((OrganizationContextSource) () -> null);

    MockHttpServletRequest request = new MockHttpServletRequest();

    assertThatThrownBy(() -> page.render(request))
        .isInstanceOf(NullPointerException.class)
        .hasMessage("OrganizationContextSource.current()");
  }

  @Test
  void the_theme_is_read_for_every_page() {
    int[] reads = {0};
    ShellPage page = page(() -> ShellTheme.stock("Read " + ++reads[0]));

    assertThat(page.render(new MockHttpServletRequest())).contains("<title>Read 1</title>");
    assertThat(page.render(new MockHttpServletRequest())).contains("<title>Read 2</title>");
  }

  @Test
  void the_app_name_cannot_break_out_of_the_page() {
    String rendered =
        page(ShellTheme.stock("</title><script>alert(1)</script>"))
            .render(new MockHttpServletRequest());

    assertThat(rendered)
        .contains("<title>&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;</title>")
        .contains("\\u003c/title>\\u003cscript>alert(1)\\u003c/script>")
        .doesNotContain("<script>alert");
  }

  @Test
  void a_name_that_looks_like_a_placeholder_is_not_filled_in_again() {
    String rendered =
        page(ShellTheme.stock("__APP_THEME__ $1 \\ __CSP_NONCE__"))
            .render(new MockHttpServletRequest());

    assertThat(rendered).contains("<title>__APP_THEME__ $1 \\ __CSP_NONCE__</title>");
  }

  @Test
  void a_source_with_no_theme_fails_loudly() {
    ShellPage page = page((ShellThemeSource) () -> null);

    MockHttpServletRequest request = new MockHttpServletRequest();

    assertThatThrownBy(() -> page.render(request))
        .isInstanceOf(NullPointerException.class)
        .hasMessage("ShellThemeSource.current()");
  }

  @ParameterizedTest
  @ValueSource(strings = {"__CSP_NONCE__", "__APP_NAME__", "__APP_THEME__", "__APP_CONTEXT__"})
  void a_page_missing_a_placeholder_is_refused_naming_it(String placeholder) {
    String template = TEMPLATE.replace(placeholder, "");
    ContentSecurityPolicy strict = ContentSecurityPolicy.strict();

    assertThatThrownBy(
            () -> new ShellPage(template, strict, () -> ShellTheme.stock("x"), () -> CONTEXT, json))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("index.html has no " + placeholder);
  }

  @Test
  void a_page_needs_a_policy_its_sources_and_a_mapper() {
    ShellThemeSource source = () -> ShellTheme.stock("x");
    OrganizationContextSource contexts = () -> CONTEXT;
    ContentSecurityPolicy policy = ContentSecurityPolicy.strict();

    assertThatThrownBy(() -> new ShellPage(TEMPLATE, null, source, contexts, json))
        .hasMessage("policy");
    assertThatThrownBy(() -> new ShellPage(TEMPLATE, policy, null, contexts, json))
        .hasMessage("themes");
    assertThatThrownBy(() -> new ShellPage(TEMPLATE, policy, source, null, json))
        .hasMessage("contexts");
    assertThatThrownBy(() -> new ShellPage(TEMPLATE, policy, source, contexts, null))
        .hasMessage("json");
  }

  @Test
  void the_built_page_is_read_as_utf8() {
    assertThat(
            ShellPage.read(
                new ByteArrayResource("héllo".getBytes(java.nio.charset.StandardCharsets.UTF_8))))
        .isEqualTo("héllo");
  }

  @Test
  void a_page_that_cannot_be_read_says_to_build_the_frontend() {
    Resource broken =
        new ByteArrayResource(new byte[0], "static/index.html") {
          @Override
          public InputStream getInputStream() throws IOException {
            throw new IOException("gone");
          }
        };

    assertThatThrownBy(() -> ShellPage.read(broken))
        .isInstanceOf(UncheckedIOException.class)
        .hasMessageContaining("static/index.html")
        .hasMessageContaining("build the frontend");
  }
}
