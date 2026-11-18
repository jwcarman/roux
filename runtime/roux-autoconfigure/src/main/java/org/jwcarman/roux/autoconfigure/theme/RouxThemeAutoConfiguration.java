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
package org.jwcarman.roux.autoconfigure.theme;

import java.util.List;

import jakarta.persistence.EntityManager;

import org.jwcarman.roux.autoconfigure.spa.RouxSpaAutoConfiguration;
import org.jwcarman.roux.spa.ShellTheme;
import org.jwcarman.roux.spa.ShellThemeSource;
import org.jwcarman.roux.theme.AppThemeRepository;
import org.jwcarman.roux.theme.OwnerShellTheme;
import org.jwcarman.roux.theme.ThemeController;
import org.jwcarman.roux.theme.ThemeRequest;
import org.jwcarman.roux.theme.ThemeResponse;
import org.jwcarman.roux.theme.ThemeService;
import org.jwcarman.who.spring.security.WhoPublicPathContributor;
import org.springframework.aot.hint.annotation.RegisterReflectionForBinding;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication.Type;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

/**
 * The owner's theme, with roux-theme on the class path: its repository (found by {@link
 * RouxThemePersistenceAutoConfiguration}), {@code GET /api/theme} and {@code PUT /api/theme}, and
 * the {@link ShellThemeSource} that gives the shell the theme in roux's own table. It needs Spring
 * Data JPA's repositories (a database); without them it does nothing. Whatever the owner has not
 * chosen is the app's {@code roux.theme.*} setting. An app's own {@code ShellThemeSource} bean
 * replaces the shell's source (the API stays); leave the jar out to turn all of it off. With who,
 * {@code /api/theme} is a public path, so the sign-in page, which the signed-out see, has its look;
 * {@code PUT} is open only to {@value ThemeController#MANAGE}.
 *
 * <p>The table comes from the jar's Liquibase changelog, which the app includes ({@code
 * classpath:org/jwcarman/roux/theme/db/roux-theme-changelog.xml}), as it includes who's.
 */
@AutoConfiguration(
    before = RouxSpaAutoConfiguration.class,
    afterName =
        "org.springframework.boot.data.jpa.autoconfigure.DataJpaRepositoriesAutoConfiguration")
@ConditionalOnClass({ThemeController.class, EntityManager.class})
@ConditionalOnWebApplication(type = Type.SERVLET)
@ConditionalOnBean(AppThemeRepository.class)
@EnableConfigurationProperties(RouxThemeProperties.class)
@RegisterReflectionForBinding({ThemeRequest.class, ThemeResponse.class})
public class RouxThemeAutoConfiguration {

  @Bean
  ThemeService themeService(
      AppThemeRepository themes, RouxThemeProperties properties, Environment environment) {
    ShellTheme defaults = properties.theme(environment.getProperty("spring.application.name"));
    return new ThemeService(themes, defaults);
  }

  @Bean
  ThemeController themeController(ThemeService themes) {
    return new ThemeController(themes);
  }

  @Bean
  @ConditionalOnMissingBean(ShellThemeSource.class)
  ShellThemeSource ownerShellTheme(ThemeService themes) {
    return new OwnerShellTheme(themes);
  }

  /** The look is shown before anyone signs in, so reading it is public. */
  @Configuration(proxyBeanMethods = false)
  @ConditionalOnClass(WhoPublicPathContributor.class)
  static class ThemePublicPaths {

    @Bean
    WhoPublicPathContributor themePublicPaths() {
      return () -> List.of(ThemeController.PATH);
    }
  }
}
