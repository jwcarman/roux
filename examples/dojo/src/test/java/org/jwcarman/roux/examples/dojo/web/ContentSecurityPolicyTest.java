package org.jwcarman.roux.examples.dojo.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

class ContentSecurityPolicyTest {

  @Test
  void aNonceIs128RandomBitsInBase64() {
    Set<String> nonces = new HashSet<>();
    IntStream.range(0, 100)
        .forEach(i -> nonces.add(ContentSecurityPolicy.nonce(new MockHttpServletRequest())));

    assertThat(nonces).hasSize(100).allMatch(nonce -> nonce.matches("[A-Za-z0-9+/]{22}=="));
  }

  @Test
  void aRequestKeepsOneNonceForItsHeaderAndItsPage() {
    MockHttpServletRequest request = new MockHttpServletRequest();

    assertThat(ContentSecurityPolicy.nonce(request))
        .isEqualTo(ContentSecurityPolicy.nonce(request));
  }

  @Test
  void scriptsAndStylesMustBeTheAppsOwnOrCarryTheNonce() {
    Map<String, String> policy = directives(ContentSecurityPolicy.forNonce("abc"));

    assertThat(policy)
        .containsEntry("default-src", "'self'")
        .containsEntry("script-src", "'self' 'nonce-abc'")
        .containsEntry("style-src", "'self' 'nonce-abc'");
  }

  @Test
  void pluginsBaseTagsAndFramingAreRefused() {
    Map<String, String> policy = directives(ContentSecurityPolicy.forNonce("abc"));

    assertThat(policy)
        .containsEntry("object-src", "'none'")
        .containsEntry("base-uri", "'none'")
        .containsEntry("frame-ancestors", "'none'")
        .containsEntry("form-action", "'self'");
  }

  @Test
  void nothingInlineOrEvaluatedIsAllowedWithoutTheNonce() {
    assertThat(ContentSecurityPolicy.forNonce("abc"))
        .doesNotContain("unsafe-inline", "unsafe-eval");
  }

  private static Map<String, String> directives(String policy) {
    return Arrays.stream(policy.split(";"))
        .map(String::strip)
        .filter(directive -> !directive.isEmpty())
        .collect(
            Collectors.toMap(
                directive -> directive.split(" ", 2)[0], directive -> directive.split(" ", 2)[1]));
  }
}
