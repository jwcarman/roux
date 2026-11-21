package app.web;

import java.net.http.HttpClient;
import java.time.Duration;

import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * A client for the test's own running server that cannot hang a build. It speaks plain HTTP/1.1,
 * since the JDK client's default asks a plain-HTTP server to upgrade to HTTP/2, and it gives up on
 * a response that stops arriving.
 */
final class LocalClient {

  /** Far longer than any local request takes; short enough that a stuck one fails the build. */
  static final Duration TIMEOUT = Duration.ofSeconds(10);

  private LocalClient() {}

  static RestClient to(int port) {
    return to(port, TIMEOUT);
  }

  static RestClient to(int port, Duration timeout) {
    HttpClient http =
        HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(timeout)
            .build();
    JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(http);
    factory.setReadTimeout(timeout);
    return RestClient.builder().baseUrl("http://localhost:" + port).requestFactory(factory).build();
  }
}
