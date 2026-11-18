package org.jwcarman.roux.examples.dojo.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.jwcarman.roux.examples.dojo.AppTest;
import org.jwcarman.roux.spa.ShellPage;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

@AppTest(webEnvironment = WebEnvironment.RANDOM_PORT)
class SpaRoutingTest {

  @LocalServerPort int port;

  /** A record id for a route's {@code *} segment. */
  private static final String SAMPLE_ID = "0190c1de-0000-7000-8000-000000000000";

  /**
   * The app's pages, as a signed-out browser opens them. The server has no list of them (roux's SPA
   * filter serves the shell for any page URL), so this is only what the test opens.
   */
  static Stream<String> pages() {
    return Stream.of(
        "/",
        "/settings",
        "/appearance",
        "/members",
        "/members/" + SAMPLE_ID,
        "/ranks",
        "/students",
        "/students/" + SAMPLE_ID,
        "/timetable",
        "/classes/" + SAMPLE_ID + "/check-in",
        "/signin",
        "/signin/link",
        "/a/page/no/route/file/names");
  }

  @ParameterizedTest
  @MethodSource("pages")
  void aDeepLinkServesTheShellSignedOut(String path) {
    ResponseEntity<String> response = get(path);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(response.getBody()).contains("<div id=\"root\">");
  }

  @Test
  void apiAndWhoEndpointsAreNotShadowed() {
    assertThat(get("/who/me").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    assertThat(get("/api/members/me").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
  }

  @Test
  void whoMeHandsASignedOutPageItsCsrfCookie() {
    assertThat(get("/who/me").getHeaders().get(HttpHeaders.SET_COOKIE))
        .anyMatch(cookie -> cookie.startsWith("XSRF-TOKEN="));
  }

  @Test
  void unknownApiPathsNeedASignedInCaller() {
    ResponseEntity<String> response = get("/api/reports/export");

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    assertThat(response.getHeaders().getLocation()).isNull();
  }

  @Test
  void aFetchForAPageUrlIsNotTheShell() {
    ResponseEntity<String> response =
        LocalClient.to(port)
            .get()
            .uri("/reports/export")
            .accept(MediaType.APPLICATION_JSON)
            .retrieve()
            .onStatus(status -> true, (request, r) -> {})
            .toEntity(String.class);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
  }

  @Test
  void passkeyRemovalNeedsASignedInCaller() {
    // With a valid CSRF token, so the answer is the authorization rule's, not CSRF's.
    String xsrf =
        get("/who/me").getHeaders().get(HttpHeaders.SET_COOKIE).stream()
            .filter(cookie -> cookie.startsWith("XSRF-TOKEN="))
            .map(cookie -> cookie.substring("XSRF-TOKEN=".length(), cookie.indexOf(';')))
            .findFirst()
            .orElseThrow();
    ResponseEntity<String> response =
        LocalClient.to(port)
            .delete()
            .uri("/who/me/passkeys/abc")
            .header(HttpHeaders.COOKIE, "XSRF-TOKEN=" + xsrf)
            .header("X-XSRF-TOKEN", xsrf)
            .retrieve()
            .onStatus(status -> true, (request, r) -> {})
            .toEntity(String.class);

    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
  }

  @Test
  void theShellAndItsAssetsLoadSignedOut() {
    ResponseEntity<String> index = get("/index.html");
    assertThat(index.getStatusCode()).isEqualTo(HttpStatus.OK);
    Matcher script = Pattern.compile("src=\"(/assets/[^\"]+)\"").matcher(index.getBody());
    assertThat(script.find()).isTrue();

    assertThat(get(script.group(1)).getStatusCode()).isEqualTo(HttpStatus.OK);
  }

  @Test
  void theFaviconLoadsSignedOut() {
    ResponseEntity<String> icon = get("/favicon.svg");

    assertThat(icon.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(icon.getHeaders().getContentType()).hasToString("image/svg+xml");
    assertThat(get("/").getBody())
        .contains("<link rel=\"icon\" type=\"image/svg+xml\" href=\"/favicon.svg\"");
  }

  @Test
  void hashedAssetsAreCachedForever() {
    ResponseEntity<String> asset = get(assetPath());

    assertThat(cacheControl(asset))
        .containsExactlyInAnyOrder("public", "max-age=31536000", "immutable");
    // Spring Security's no-cache headers stay off: a cache must not see a conflicting Pragma.
    assertThat(asset.getHeaders().get(HttpHeaders.PRAGMA)).isNull();
    assertThat(asset.getHeaders().get(HttpHeaders.EXPIRES)).isNull();
  }

  @ParameterizedTest
  @ValueSource(
      strings = {"/", "/index.html", "/settings", "/appearance", "/members", "/signin/link"})
  void theShellIsNeverStored(String path) {
    ResponseEntity<String> shell = get(path);

    // Each copy carries its own nonce: a stored one would not match the next response's policy.
    assertThat(shell.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(cacheControl(shell)).contains("no-store").doesNotContain("immutable");
  }

  @ParameterizedTest
  @ValueSource(strings = {"/", "/index.html", "/members", "/signin/link"})
  void theShellCarriesTheNonceItsPolicyAllows(String path) {
    ResponseEntity<String> shell = get(path);
    String nonce = nonceOf(shell);

    assertThat(shell.getBody())
        .contains("<script nonce=\"" + nonce + "\"")
        .contains("<script type=\"module\" crossorigin src=")
        .doesNotContain(ShellPage.NONCE_PLACEHOLDER);
  }

  @Test
  void eachLoadOfTheShellHasItsOwnNonce() {
    assertThat(nonceOf(get("/"))).isNotEqualTo(nonceOf(get("/")));
  }

  @Test
  void apiAndWhoResponsesAreNeverStored() {
    assertThat(cacheControl(get("/who/me"))).contains("no-store");
    assertThat(cacheControl(get("/api/members/me"))).contains("no-store");
  }

  @ParameterizedTest
  @ValueSource(strings = {"/", "/index.html", "/settings", "/favicon.ico"})
  void headIsAnsweredWhereGetIs(String path) {
    assertThat(head(path).getStatusCode()).isEqualTo(get(path).getStatusCode());
  }

  @Test
  void headOnAnAssetIsAnswered() {
    ResponseEntity<Void> asset = head(assetPath());

    assertThat(asset.getStatusCode()).isEqualTo(HttpStatus.OK);
    assertThat(cacheControl(asset)).contains("immutable");
  }

  private static final String CSP = "Content-Security-Policy";

  private static String nonceOf(ResponseEntity<String> response) {
    String policy = response.getHeaders().getFirst(CSP);
    assertThat(policy).isNotNull();
    Matcher nonce = Pattern.compile("'nonce-([^']+)'").matcher(policy);
    assertThat(nonce.find()).isTrue();
    return nonce.group(1);
  }

  private String assetPath() {
    Matcher script = Pattern.compile("src=\"(/assets/[^\"]+)\"").matcher(get("/").getBody());
    assertThat(script.find()).isTrue();
    return script.group(1);
  }

  private static Set<String> cacheControl(ResponseEntity<?> response) {
    String value = response.getHeaders().getCacheControl();
    if (value == null) {
      return Set.of();
    }
    return Arrays.stream(value.split(","))
        .map(String::strip)
        .map(directive -> directive.toLowerCase(Locale.ROOT))
        .collect(Collectors.toSet());
  }

  private ResponseEntity<Void> head(String path) {
    return LocalClient.to(port)
        .head()
        .uri(path)
        .accept(MediaType.TEXT_HTML)
        .retrieve()
        .onStatus(status -> true, (request, response) -> {})
        .toBodilessEntity();
  }

  private ResponseEntity<String> get(String path) {
    return LocalClient.to(port)
        .get()
        .uri(path)
        .accept(MediaType.TEXT_HTML)
        .retrieve()
        .onStatus(status -> true, (request, response) -> {})
        .toEntity(String.class);
  }
}
