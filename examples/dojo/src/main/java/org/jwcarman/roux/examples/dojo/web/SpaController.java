package org.jwcarman.roux.examples.dojo.web;

import java.time.Duration;

import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * The single-page app's routes and its hashed assets. {@link ShellController} serves the page for
 * each of {@link #ROUTES}; only the app's own routes are listed, so the API, who's endpoints and
 * static assets are never shadowed. A signed-out browser may load each of them only when it is in
 * {@code who.security.public-paths} too (application.yml): add a client route in both places.
 */
@Configuration
public class SpaController implements WebMvcConfigurer {

  /** The client-side routes: the URLs of the route files in {@code frontend/src/routes}. */
  public static final String[] ROUTES = {
    "/", "/settings", "/appearance", "/members", "/members/*", "/ranks", "/signin", "/signin/link",
  };

  /**
   * How long a browser or CDN may keep a file under {@code /assets/}. Vite puts a content hash in
   * each of those file names, so a changed file always has a new name and an old one never changes.
   */
  static final Duration ASSET_LIFETIME = Duration.ofDays(365);

  /**
   * Caches the hashed assets forever. Every other static file keeps Spring Boot's handler and
   * {@code spring.web.resources.cache.cachecontrol.no-cache} (application.yml); the page itself is
   * never stored ({@link ShellController}), so a new deploy reaches the browser on its next load.
   */
  @Override
  public void addResourceHandlers(ResourceHandlerRegistry registry) {
    registry
        .addResourceHandler("/assets/**")
        .addResourceLocations("classpath:/static/assets/")
        .setCacheControl(CacheControl.maxAge(ASSET_LIFETIME).cachePublic().immutable());
  }
}
