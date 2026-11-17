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
import java.util.stream.Stream;

import org.jwcarman.who.spring.security.PasswordlessLoginMethod;
import org.jwcarman.who.spring.security.WhoPublicPaths;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnResource;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication.Type;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Serves a single-page app: the shell for any page URL ({@link SpaFallbackFilter}) and the hashed
 * assets for a year. On when a servlet application has {@code static/index.html} on its classpath
 * (the frontend build puts it there); off with {@code roux.spa.enabled=false}. With who on the
 * classpath, the shell and {@code /assets/**} are also public paths, so a signed-out visitor loads
 * the app from any URL without the application listing its pages.
 */
@AutoConfiguration(beforeName = "org.jwcarman.who.autoconfigure.WhoSpringSecurityAutoConfiguration")
@ConditionalOnWebApplication(type = Type.SERVLET)
@ConditionalOnResource(resources = "classpath:/static" + SpaFallbackFilter.SHELL)
@ConditionalOnBooleanProperty(name = "roux.spa.enabled", matchIfMissing = true)
@EnableConfigurationProperties(RouxSpaProperties.class)
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

  /**
   * Caches the hashed assets forever. Every other static file keeps Spring Boot's handler; the
   * shell is the application's to cache or not.
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
   * who's public paths with the shell and the assets added. who builds its own only when the
   * application has none, so this one stands in for it: the same error page, sign-in methods' paths
   * and {@code who.security.public-paths}, plus what the app needs to load signed out.
   */
  @Configuration(proxyBeanMethods = false)
  @ConditionalOnClass(WhoPublicPaths.class)
  static class SpaPublicPaths {

    @Bean
    @ConditionalOnMissingBean
    WhoPublicPaths whoPublicPaths(
        ObjectProvider<PasswordlessLoginMethod> methods, Environment environment) {
      List<String> configured =
          Binder.get(environment)
              .bind("who.security.public-paths", Bindable.listOf(String.class))
              .orElse(List.of());
      return new WhoPublicPaths(
          methods.orderedStream().toList(),
          Stream.concat(Stream.of(SpaFallbackFilter.SHELL, ASSETS), configured.stream()).toList());
    }
  }
}
