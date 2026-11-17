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

import java.io.IOException;
import java.util.Collection;
import java.util.List;
import java.util.stream.Stream;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;
import org.springframework.http.server.PathContainer;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.pattern.PathPattern;
import org.springframework.web.util.pattern.PathPatternParser;

/**
 * Answers a browser's request for a client-side route with the app's shell, {@value #SHELL}, so a
 * reload or a deep link opens the page instead of a 404 or a 401. A request is a page request when
 * it is a GET or HEAD that accepts {@code text/html}, its path has no file extension and it is not
 * under an {@linkplain #DEFAULT_EXCLUDED_PATHS excluded path}. The route table lives in the
 * frontend only: any other page URL gets the shell too, and the app's own "not found" route answers
 * it.
 *
 * <p>The filter runs ahead of Spring Security and presents the request to everything after it as a
 * request for {@value #SHELL}. Security therefore decides on the shell, not on the page, and the
 * shell is rendered, secured and given its headers exactly as a direct request for it is. A fetch
 * for JSON, an API path and a missing file never match, so they keep their own answers.
 */
public class SpaFallbackFilter extends OncePerRequestFilter {

  /** The shell's path: Vite's {@code index.html}. */
  public static final String SHELL = "/index.html";

  /** Where a page URL never begins: the API, who, hashed assets, Actuator and the error page. */
  public static final List<String> DEFAULT_EXCLUDED_PATHS =
      List.of("/api/**", "/who/**", "/assets/**", "/actuator/**", "/.well-known/**", "/error");

  private final List<PathPattern> excluded;

  /**
   * Creates the filter.
   *
   * @param extraExcludedPaths path patterns to leave alone besides {@link #DEFAULT_EXCLUDED_PATHS}
   */
  public SpaFallbackFilter(Collection<String> extraExcludedPaths) {
    PathPatternParser parser = PathPatternParser.defaultInstance;
    this.excluded =
        Stream.concat(DEFAULT_EXCLUDED_PATHS.stream(), extraExcludedPaths.stream())
            .map(parser::parse)
            .toList();
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {
    if (isPageRequest(request)) {
      chain.doFilter(new ShellRequest(request), response);
    } else {
      chain.doFilter(request, response);
    }
  }

  private boolean isPageRequest(HttpServletRequest request) {
    String method = request.getMethod();
    if (!HttpMethod.GET.matches(method) && !HttpMethod.HEAD.matches(method)) {
      return false;
    }
    if (!acceptsHtml(request)) {
      return false;
    }
    String path = request.getRequestURI().substring(request.getContextPath().length());
    return !hasFileExtension(path) && excluded.stream().noneMatch(p -> matches(p, path));
  }

  private static boolean matches(PathPattern pattern, String path) {
    return pattern.matches(PathContainer.parsePath(path));
  }

  /** Whether the Accept header names {@code text/html}; a wildcard alone does not. */
  private static boolean acceptsHtml(HttpServletRequest request) {
    String accept = request.getHeader(HttpHeaders.ACCEPT);
    if (accept == null) {
      return false;
    }
    try {
      return MediaType.parseMediaTypes(accept).stream()
          .anyMatch(MediaType.TEXT_HTML::equalsTypeAndSubtype);
    } catch (InvalidMediaTypeException e) {
      return false;
    }
  }

  private static boolean hasFileExtension(String path) {
    return path.substring(path.lastIndexOf('/') + 1).indexOf('.') >= 0;
  }

  /** The request as one for {@link #SHELL}, so security, headers and the handler all see that. */
  private static final class ShellRequest extends HttpServletRequestWrapper {

    ShellRequest(HttpServletRequest request) {
      super(request);
    }

    @Override
    public String getRequestURI() {
      return getContextPath() + SHELL;
    }

    @Override
    public StringBuffer getRequestURL() {
      StringBuffer url = super.getRequestURL();
      url.setLength(url.length() - super.getRequestURI().length());
      return url.append(getRequestURI());
    }

    @Override
    public String getServletPath() {
      return SHELL;
    }

    @Override
    public String getPathInfo() {
      return null;
    }
  }
}
