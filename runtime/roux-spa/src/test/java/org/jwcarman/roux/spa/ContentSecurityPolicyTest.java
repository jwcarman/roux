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
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.jwcarman.roux.spa.ContentSecurityPolicy.Extendable;

@DisplayNameGeneration(ReplaceUnderscores.class)
class ContentSecurityPolicyTest {

  private static Map<String, String> directives(String policy) {
    return Arrays.stream(policy.split("; "))
        .collect(Collectors.toMap(d -> d.split(" ", 2)[0], d -> d.split(" ", 2)[1]));
  }

  @Test
  void scripts_and_styles_are_the_apps_own_or_carry_the_nonce() {
    Map<String, String> policy = directives(ContentSecurityPolicy.strict().forNonce("abc"));

    assertThat(policy)
        .containsEntry("default-src", "'self'")
        .containsEntry("script-src", "'self' 'nonce-abc'")
        .containsEntry("style-src", "'self' 'nonce-abc'");
  }

  @Test
  void everything_else_is_the_apps_own_and_images_may_be_data_urls() {
    Map<String, String> policy = directives(ContentSecurityPolicy.strict().forNonce("abc"));

    assertThat(policy)
        .containsEntry("img-src", "'self' data:")
        .containsEntry("font-src", "'self'")
        .containsEntry("connect-src", "'self'")
        .containsEntry("frame-src", "'self'")
        .containsEntry("media-src", "'self'")
        .containsEntry("form-action", "'self'");
  }

  @Test
  void plugins_base_tags_and_framing_are_refused() {
    Map<String, String> policy = directives(ContentSecurityPolicy.strict().forNonce("abc"));

    assertThat(policy)
        .containsEntry("object-src", "'none'")
        .containsEntry("base-uri", "'self'")
        .containsEntry("frame-ancestors", "'none'");
  }

  @Test
  void nothing_inline_or_evaluated_is_allowed_without_the_nonce() {
    assertThat(ContentSecurityPolicy.strict().forNonce("abc"))
        .doesNotContain("unsafe-inline", "unsafe-eval", "*");
  }

  @Test
  void the_directives_are_exactly_these_and_nothing_else_can_be_added() {
    assertThat(directives(ContentSecurityPolicy.strict().forNonce("n")).keySet())
        .containsExactlyInAnyOrder(
            "default-src",
            "script-src",
            "style-src",
            "img-src",
            "font-src",
            "connect-src",
            "frame-src",
            "media-src",
            "form-action",
            "object-src",
            "base-uri",
            "frame-ancestors");
    assertThat(Extendable.values())
        .extracting(Extendable::directive)
        .doesNotContain("default-src", "object-src", "base-uri", "frame-ancestors");
  }

  @ParameterizedTest
  @EnumSource(Extendable.class)
  void a_source_is_appended_after_the_defaults_never_replacing_them(Extendable directive) {
    ContentSecurityPolicy extended =
        ContentSecurityPolicy.strict()
            .extendedBy(
                Map.of(directive, List.of("https://cdn.example.com", "wss://live.example.com")));

    String value = directives(extended.forNonce("n")).get(directive.directive());

    String defaults =
        directives(ContentSecurityPolicy.strict().forNonce("n")).get(directive.directive());
    assertThat(value).isEqualTo(defaults + " https://cdn.example.com wss://live.example.com");
  }

  @Test
  void extending_twice_adds_both_and_leaves_the_first_policy_alone() {
    ContentSecurityPolicy strict = ContentSecurityPolicy.strict();
    ContentSecurityPolicy once =
        strict.extendedBy(Map.of(Extendable.IMG_SRC, List.of("https://a.example.com")));
    ContentSecurityPolicy twice =
        once.extendedBy(Map.of(Extendable.IMG_SRC, List.of("https://b.example.com")));

    assertThat(directives(twice.forNonce("n")))
        .containsEntry("img-src", "'self' data: https://a.example.com https://b.example.com");
    assertThat(directives(once.forNonce("n")))
        .containsEntry("img-src", "'self' data: https://a.example.com");
    assertThat(directives(strict.forNonce("n"))).containsEntry("img-src", "'self' data:");
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "*",
        "'unsafe-inline'",
        "'UNSAFE-EVAL'",
        "'unsafe-hashes'",
        "https://a.example.com; script-src *",
        "https://a.example.com 'unsafe-inline'",
        "https://a.example.com,https://b.example.com",
        "",
        " "
      })
  void a_source_that_loosens_the_policy_is_refused_for_every_directive(String source) {
    ContentSecurityPolicy strict = ContentSecurityPolicy.strict();
    for (Extendable directive : Extendable.values()) {
      Map<Extendable, List<String>> extra = Map.of(directive, List.of(source));
      assertThatThrownBy(() -> strict.extendedBy(extra))
          .isInstanceOf(IllegalArgumentException.class)
          .hasMessageContaining("roux.spa.csp." + directive.directive())
          .hasMessageContaining("'" + source + "'");
    }
  }

  @ParameterizedTest
  @ValueSource(strings = {"https:", "data:", "blob:", "http:"})
  void a_bare_scheme_is_refused_for_scripts_and_styles(String scheme) {
    assertThatThrownBy(
            () ->
                ContentSecurityPolicy.strict()
                    .extendedBy(Map.of(Extendable.SCRIPT_SRC, List.of(scheme))))
        .hasMessageContaining("would allow every " + scheme + " script-src source");
    assertThatThrownBy(
            () ->
                ContentSecurityPolicy.strict()
                    .extendedBy(Map.of(Extendable.STYLE_SRC, List.of(scheme))))
        .hasMessageContaining("would allow every " + scheme + " style-src source");
  }

  @Test
  void a_scheme_is_fine_where_it_cannot_run_code() {
    assertThatCode(
            () ->
                ContentSecurityPolicy.strict()
                    .extendedBy(
                        Map.of(
                            Extendable.IMG_SRC, List.of("https:"),
                            Extendable.CONNECT_SRC, List.of("wss:"))))
        .doesNotThrowAnyException();
  }

  @Test
  void a_host_is_fine_for_scripts() {
    assertThat(
            directives(
                ContentSecurityPolicy.strict()
                    .extendedBy(Map.of(Extendable.SCRIPT_SRC, List.of("https://js.example.com")))
                    .forNonce("n")))
        .containsEntry("script-src", "'self' 'nonce-n' https://js.example.com");
  }
}
