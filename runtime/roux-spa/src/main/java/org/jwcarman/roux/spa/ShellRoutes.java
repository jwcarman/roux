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

import static org.springframework.web.servlet.function.RequestPredicates.GET;
import static org.springframework.web.servlet.function.RequestPredicates.HEAD;

import java.nio.charset.StandardCharsets;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.function.RouterFunction;
import org.springframework.web.servlet.function.RouterFunctions;
import org.springframework.web.servlet.function.ServerRequest;
import org.springframework.web.servlet.function.ServerResponse;

/**
 * Serves {@link ShellPage} at {@value SpaFallbackFilter#SHELL}, which {@link SpaFallbackFilter}
 * makes of every page URL. Each response is HTML, {@code Cache-Control: no-store} (a stored copy
 * would carry a nonce the next response's policy does not allow) and carries its own {@code
 * Content-Security-Policy} and {@code X-Content-Type-Options: nosniff} (stated here, not left to a
 * default that something upstream may drop).
 */
public final class ShellRoutes {

  private static final MediaType HTML = new MediaType(MediaType.TEXT_HTML, StandardCharsets.UTF_8);

  private ShellRoutes() {}

  /** The route that serves {@code page}. */
  public static RouterFunction<ServerResponse> of(ShellPage page) {
    return RouterFunctions.route(
        GET(SpaFallbackFilter.SHELL).or(HEAD(SpaFallbackFilter.SHELL)),
        request -> render(page, request));
  }

  private static ServerResponse render(ShellPage page, ServerRequest request) {
    var response =
        ServerResponse.ok()
            .contentType(HTML)
            .cacheControl(CacheControl.noStore())
            .header("X-Content-Type-Options", "nosniff")
            .header(ContentSecurityPolicy.HEADER, page.policyFor(request.servletRequest()));
    return request.method() == HttpMethod.HEAD
        ? response.build()
        : response.body(page.render(request.servletRequest()));
  }
}
