package org.jwcarman.roux.examples.dojo.web;

import static org.springframework.web.servlet.function.RequestPredicates.GET;
import static org.springframework.web.servlet.function.RequestPredicates.HEAD;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;

import jakarta.servlet.http.HttpServletRequest;

import org.jwcarman.roux.examples.dojo.theme.ThemeService;
import org.jwcarman.roux.examples.dojo.theme.ThemeService.Theme;
import org.springframework.aot.hint.annotation.RegisterReflectionForBinding;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.webmvc.autoconfigure.error.ErrorViewResolver;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.servlet.ModelAndView;
import org.springframework.web.servlet.View;
import org.springframework.web.servlet.function.RouterFunction;
import org.springframework.web.servlet.function.RouterFunctions;
import org.springframework.web.servlet.function.ServerRequest;
import org.springframework.web.servlet.function.ServerResponse;
import org.springframework.web.util.HtmlUtils;

import tools.jackson.databind.json.JsonMapper;

/**
 * Serves the single-page app's page, {@code index.html} as Vite built it. roux's SPA filter
 * presents every page URL (any client route) to the app as a request for {@code /index.html}, so
 * this is the one route, and the frontend's route files are the only list of pages. Vite marks
 * every script and style tag with {@link #NONCE_PLACEHOLDER} ({@code html.cspNonce} in {@code
 * vite.config.ts}); each response replaces it with that request's nonce, the one its
 * Content-Security-Policy allows. Each response also carries the owner's theme ({@link
 * #THEME_PLACEHOLDER}) and the app's name as the page title ({@link #APP_NAME_PLACEHOLDER}), read
 * when the page is rendered.
 *
 * <p>{@link PageTheme} is written with Jackson, so a native image needs its record components.
 */
@Configuration
@RegisterReflectionForBinding(ShellController.PageTheme.class)
public class ShellController {

  /** What Vite writes where the nonce goes. */
  public static final String NONCE_PLACEHOLDER = "__CSP_NONCE__";

  /** What {@code index.html} holds where the theme's JSON goes. */
  public static final String THEME_PLACEHOLDER = "__APP_THEME__";

  /** What {@code index.html} holds where the app's name goes, in the title. */
  public static final String APP_NAME_PLACEHOLDER = "__APP_NAME__";

  private static final MediaType HTML = new MediaType(MediaType.TEXT_HTML, StandardCharsets.UTF_8);

  private final Resource page;
  private final ThemeService themes;
  private final JsonMapper json;
  private String template;

  ShellController(
      @Value("classpath:/static/index.html") Resource page, ThemeService themes, JsonMapper json) {
    this.page = page;
    this.themes = themes;
    this.json = json;
  }

  @Bean
  RouterFunction<ServerResponse> shellRoutes() {
    return RouterFunctions.route(GET("/index.html").or(HEAD("/index.html")), this::render);
  }

  /**
   * The page with this request's nonce. Never stored: a stored copy's nonce would not match the
   * policy on the next response, and the browser would refuse the app's own scripts.
   */
  private ServerResponse render(ServerRequest request) {
    return ServerResponse.ok()
        .contentType(HTML)
        .cacheControl(CacheControl.noStore())
        .body(page(request.servletRequest()));
  }

  /** The page, with {@code request}'s nonce, the theme and the app's name in their places. */
  String page(HttpServletRequest request) {
    Theme theme = themes.current();
    return template()
        .replace(NONCE_PLACEHOLDER, ContentSecurityPolicy.nonce(request))
        .replace(APP_NAME_PLACEHOLDER, HtmlUtils.htmlEscape(theme.appName()))
        .replace(THEME_PLACEHOLDER, themeJson(theme));
  }

  /**
   * The theme as JSON for a {@code <script>} element. Every {@code <} is written as its escape, so
   * nothing in it (an app name holding {@code </script>}) can end the element.
   */
  private String themeJson(Theme theme) {
    PageTheme pageTheme =
        new PageTheme(
            theme.palette(),
            theme.brandColor(),
            theme.shape(),
            theme.headingFont(),
            theme.bodyFont(),
            theme.appName());
    return json.writeValueAsString(pageTheme).replace("<", "\\u003c");
  }

  /** The theme as the page carries it: everything but the version. */
  record PageTheme(
      String palette,
      String brandColor,
      String shape,
      String headingFont,
      String bodyFont,
      String appName) {}

  /**
   * Answers a browser's request for a page that does not exist (404, signed in) with the app, whose
   * router shows "Page not found"; the status stays 404. API and other non-HTML errors are left to
   * Spring Boot.
   */
  @Bean
  ErrorViewResolver shellForMissingPages() {
    return (request, status, model) -> {
      if (status != HttpStatus.NOT_FOUND) {
        return null;
      }
      View shell =
          (viewModel, viewRequest, response) -> {
            response.setContentType(HTML.toString());
            response.setHeader(HttpHeaders.CACHE_CONTROL, CacheControl.noStore().getHeaderValue());
            response.getWriter().write(page(viewRequest));
          };
      ModelAndView view = new ModelAndView(shell);
      view.setStatus(HttpStatus.NOT_FOUND);
      return view;
    };
  }

  /** The built page, read on first use: the frontend build puts it on the classpath. */
  private synchronized String template() {
    if (template == null) {
      try (InputStream in = page.getInputStream()) {
        template = new String(in.readAllBytes(), StandardCharsets.UTF_8);
      } catch (IOException e) {
        throw new UncheckedIOException(
            "No static/index.html on the classpath: build the frontend", e);
      }
    }
    return template;
  }
}
