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
package org.jwcarman.roux.autoconfigure.spa;

import java.time.Duration;
import java.util.List;

import org.jwcarman.roux.autoconfigure.theme.RouxThemeProperties;
import org.jwcarman.roux.spa.ContentSecurityPolicy;
import org.jwcarman.roux.spa.ShellPage;
import org.jwcarman.roux.spa.ShellRoutes;
import org.jwcarman.roux.spa.ShellTheme;
import org.jwcarman.roux.spa.ShellThemeSource;
import org.jwcarman.roux.spa.SpaFallbackFilter;
import org.jwcarman.who.spring.security.WhoPublicPathContributor;
import org.springframework.aot.hint.annotation.RegisterReflectionForBinding;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnResource;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication.Type;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.io.ResourceLoader;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.function.RouterFunction;
import org.springframework.web.servlet.function.ServerResponse;

import tools.jackson.databind.json.JsonMapper;

/**
 * Serves a single-page app: the shell for any page URL ({@link SpaFallbackFilter}) and the hashed
 * assets for a year. The shell is {@code index.html} with each response's nonce, the app's theme
 * and name in place, {@code Cache-Control: no-store} and a strict Content-Security-Policy ({@link
 * ContentSecurityPolicy}, extended only by {@code roux.spa.csp.*}); the theme comes from the {@link
 * ShellThemeSource} bean (roux-theme's, an app's own, or the {@code roux.theme.*} properties). The
 * page must hold the placeholders the frontend build leaves ({@link ShellPage}), or the app does
 * not start. On when a servlet application has {@code static/index.html} on its classpath (the
 * frontend build puts it there), and roux-spa, the module with {@link SpaFallbackFilter}, is on the
 * class path: leave the jar out to turn it off. With who on the classpath, the shell and {@code
 * /assets/**} are also public paths (a {@code WhoPublicPathContributor} bean, beside whatever the
 * app and other libraries contribute), so a signed-out visitor loads the app from any URL without
 * the application listing its pages.
 */
@AutoConfiguration(afterName = "org.jwcarman.roux.autoconfigure.theme.RouxThemeAutoConfiguration")
@ConditionalOnClass(SpaFallbackFilter.class)
@ConditionalOnWebApplication(type = Type.SERVLET)
@ConditionalOnResource(resources = "classpath:/static" + SpaFallbackFilter.SHELL)
@EnableConfigurationProperties({RouxSpaProperties.class, RouxThemeProperties.class})
@RegisterReflectionForBinding(ShellTheme.class)
public class RouxSpaAutoConfiguration {

  /** Just ahead of Spring Security's filter chain, which is ordered at -100. */
  static final int FILTER_ORDER = -101;

  /**
   * How long a browser or CDN may keep a file under {@code /assets/}. Vite puts a content hash in
   * each of those file names, so a changed file always has a new name and an old one never changes.
   */
  static final Duration ASSET_LIFETIME = Duration.ofDays(365);

  static final String ASSETS = "/assets/**";

  @Bean
  FilterRegistrationBean<SpaFallbackFilter> spaFallbackFilter(RouxSpaProperties properties) {
    FilterRegistrationBean<SpaFallbackFilter> registration =
        new FilterRegistrationBean<>(new SpaFallbackFilter(properties.excludedPaths()));
    registration.setOrder(FILTER_ORDER);
    return registration;
  }

  /** The look from {@code roux.theme.*}, unless roux-theme or the app supplies its own source. */
  @Bean
  @ConditionalOnMissingBean(ShellThemeSource.class)
  ShellThemeSource propertyShellTheme(RouxThemeProperties properties, Environment environment) {
    ShellTheme theme = properties.theme(environment.getProperty("spring.application.name"));
    return () -> theme;
  }

  /** The shell, read from the classpath at startup: a page without the placeholders fails here. */
  @Bean
  ShellPage shellPage(
      RouxSpaProperties properties,
      ShellThemeSource themes,
      ObjectProvider<JsonMapper> json,
      ResourceLoader resources) {
    return new ShellPage(
        ShellPage.read(resources.getResource("classpath:/static" + SpaFallbackFilter.SHELL)),
        ContentSecurityPolicy.strict().extendedBy(properties.csp().sources()),
        themes,
        json.getIfAvailable(() -> JsonMapper.builder().build()));
  }

  @Bean
  RouterFunction<ServerResponse> rouxShellRoutes(ShellPage page) {
    return ShellRoutes.of(page);
  }

  /**
   * Caches the hashed assets forever. Every other static file keeps Spring Boot's handler; the
   * shell is served by {@link #rouxShellRoutes}, never stored.
   */
  @Bean
  WebMvcConfigurer spaAssets() {
    return new WebMvcConfigurer() {
      @Override
      public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry
            .addResourceHandler(ASSETS)
            .addResourceLocations("classpath:/static/assets/")
            .setCacheControl(CacheControl.maxAge(ASSET_LIFETIME).cachePublic().immutable());
      }
    };
  }

  /**
   * Adds the shell and the assets to who's public paths. A contributor only adds: who's own paths,
   * {@code who.security.public-paths} and every other contributor still apply, which a replaced
   * {@code WhoPublicPaths} bean would drop.
   */
  @Configuration(proxyBeanMethods = false)
  @ConditionalOnClass(WhoPublicPathContributor.class)
  static class SpaPublicPaths {

    @Bean
    WhoPublicPathContributor spaPublicPaths() {
      return () -> List.of(SpaFallbackFilter.SHELL, ASSETS);
    }
  }
}
