package org.jwcarman.roux.examples.dojo.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.jwcarman.roux.test.AppTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.http.HttpHeaders;
import org.springframework.web.client.RestClient;

/** The session cookie as the running server sends it, with the app's default configuration. */
@AppTest(webEnvironment = WebEnvironment.RANDOM_PORT)
class SessionCookieTest {

  @LocalServerPort int port;

  @Test
  void sessionCookieIsSecureHttpOnlyAndSameSiteLax() {
    RestClient client = LocalClient.to(port);
    String xsrf =
        cookie(
            client.get().uri("/who/me").exchange((request, response) -> response.getHeaders()),
            "XSRF-TOKEN");
    String token = xsrf.substring("XSRF-TOKEN=".length(), xsrf.indexOf(';'));

    // Passkey sign-in keeps its challenge in the session, so this starts one.
    HttpHeaders headers =
        client
            .post()
            .uri("/who/passkey/sign-in/options")
            .header(HttpHeaders.COOKIE, "XSRF-TOKEN=" + token)
            .header("X-XSRF-TOKEN", token)
            .exchange((request, response) -> response.getHeaders());

    // Spring Session names the cookie SESSION.
    assertThat(cookie(headers, "SESSION"))
        .containsIgnoringCase("; Secure")
        .containsIgnoringCase("; HttpOnly")
        .containsIgnoringCase("; SameSite=Lax");
  }

  private static String cookie(HttpHeaders headers, String name) {
    List<String> cookies = headers.getOrEmpty(HttpHeaders.SET_COOKIE);
    return cookies.stream().filter(c -> c.startsWith(name + "=")).findFirst().orElseThrow();
  }
}
