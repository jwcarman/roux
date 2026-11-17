package org.jwcarman.roux.examples.dojo.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.Test;
import org.springframework.web.client.ResourceAccessException;

class LocalClientTest {

  /** Accepts one connection, reads the request head, and never answers. */
  private static CompletableFuture<List<String>> silentServer(ServerSocket server) {
    return CompletableFuture.supplyAsync(
        () -> {
          try {
            Socket socket = server.accept();
            BufferedReader in =
                new BufferedReader(
                    new InputStreamReader(socket.getInputStream(), StandardCharsets.US_ASCII));
            List<String> head = new ArrayList<>();
            for (String line = in.readLine();
                line != null && !line.isEmpty();
                line = in.readLine()) {
              head.add(line);
            }
            return head;
          } catch (IOException e) {
            throw new IllegalStateException(e);
          }
        });
  }

  @Test
  void aServerThatNeverAnswersFailsTheRequestInsteadOfHangingIt() throws Exception {
    try (ServerSocket server = new ServerSocket(0)) {
      silentServer(server);
      var client = LocalClient.to(server.getLocalPort(), Duration.ofMillis(500));

      assertTimeoutPreemptively(
          Duration.ofSeconds(5),
          () ->
              assertThatThrownBy(() -> client.get().uri("/who/me").retrieve().toBodilessEntity())
                  .isInstanceOf(ResourceAccessException.class));
    }
  }

  @Test
  void requestsArePlainHttp11WithNoUpgradeToHttp2() throws Exception {
    try (ServerSocket server = new ServerSocket(0)) {
      CompletableFuture<List<String>> head = silentServer(server);
      var client = LocalClient.to(server.getLocalPort(), Duration.ofMillis(500));

      assertTimeoutPreemptively(
          Duration.ofSeconds(5),
          () ->
              assertThatThrownBy(() -> client.get().uri("/who/me").retrieve().toBodilessEntity())
                  .isInstanceOf(ResourceAccessException.class));

      List<String> lines = head.get(5, TimeUnit.SECONDS);
      assertThat(lines).first().isEqualTo("GET /who/me HTTP/1.1");
      assertThat(lines).noneMatch(line -> line.toLowerCase(Locale.ROOT).startsWith("upgrade:"));
    }
  }
}
