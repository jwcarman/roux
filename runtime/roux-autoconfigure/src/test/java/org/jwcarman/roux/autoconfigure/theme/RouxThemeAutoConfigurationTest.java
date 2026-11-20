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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.util.Optional;

import jakarta.persistence.EntityManager;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.autoconfigure.organization.RouxOrganizationAutoConfiguration;
import org.jwcarman.roux.autoconfigure.spa.RouxSpaAutoConfiguration;
import org.jwcarman.roux.spa.ShellTheme;
import org.jwcarman.roux.spa.ShellThemeSource;
import org.jwcarman.roux.theme.AppTheme;
import org.jwcarman.roux.theme.AppThemeRepository;
import org.jwcarman.roux.theme.OwnerShellTheme;
import org.jwcarman.roux.theme.ThemeController;
import org.jwcarman.roux.theme.ThemeService;
import org.jwcarman.who.spring.security.WhoPublicPathContributor;
import org.mockito.Mockito;
import org.springframework.boot.autoconfigure.AutoConfigurationPackages;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.FilteredClassLoader;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import org.springframework.test.util.ReflectionTestUtils;

@DisplayNameGeneration(ReplaceUnderscores.class)
class RouxThemeAutoConfigurationTest {

  private final WebApplicationContextRunner web = runner(mock(AppThemeRepository.class));

  private static WebApplicationContextRunner runner(AppThemeRepository themes) {
    return new WebApplicationContextRunner()
        .withConfiguration(
            AutoConfigurations.of(
                RouxThemeAutoConfiguration.class,
                RouxOrganizationAutoConfiguration.class,
                RouxSpaAutoConfiguration.class))
        .withBean(AppThemeRepository.class, () -> themes)
        .withPropertyValues(
            "spring.application.name=dojo",
            "roux.theme.palette=teal",
            "roux.organization.time-zone=America/New_York",
            "roux.organization.locale=en-US");
  }

  @Test
  void the_service_the_controller_and_the_shell_source_are_there_with_the_jar() {
    web.run(
        context -> {
          assertThat(context)
              .hasSingleBean(ThemeService.class)
              .hasSingleBean(ThemeController.class);
          assertThat(context.getBean(ThemeController.class)).isNotNull();
          assertThat(context.getBean(ThemeService.class)).isNotNull();
          assertThat(context.getBean(ShellThemeSource.class)).isInstanceOf(OwnerShellTheme.class);
          assertThat(context).hasSingleBean(ShellThemeSource.class);
        });
  }

  @Test
  void whatever_the_owner_has_not_chosen_is_the_roux_theme_setting() {
    AppThemeRepository themes = mock(AppThemeRepository.class);
    AppTheme row = new AppTheme() {};
    ReflectionTestUtils.setField(row, "version", 0L);
    Mockito.when(themes.findById(AppTheme.ID)).thenReturn(Optional.of(row));
    runner(themes)
        .run(
            context ->
                assertThat(context.getBean(ShellThemeSource.class).current())
                    .isEqualTo(
                        new ShellTheme(
                            "dojo", "teal", "#3b82f6", "medium", "standard", "standard")));
  }

  @Test
  void the_theme_is_read_by_anyone() {
    web.run(
        context ->
            assertThat(context.getBeansOfType(WhoPublicPathContributor.class).values())
                .flatMap(WhoPublicPathContributor::publicPaths)
                .contains("/api/theme"));
  }

  @Test
  void an_app_with_its_own_source_keeps_the_api_but_loses_the_table_as_the_shells_look() {
    web.withBean(ShellThemeSource.class, () -> () -> ShellTheme.stock("Mine"))
        .run(
            context -> {
              assertThat(context).hasSingleBean(ThemeController.class);
              assertThat(context.getBean(ShellThemeSource.class).current().appName())
                  .isEqualTo("Mine");
            });
  }

  @Test
  void without_who_the_theme_is_not_a_public_path() {
    web.withClassLoader(new FilteredClassLoader(WhoPublicPathContributor.class))
        .run(context -> assertThat(context).hasSingleBean(ThemeController.class));
  }

  @Test
  void without_the_roux_theme_jar_there_is_no_owner_theme() {
    web.withClassLoader(new FilteredClassLoader(ThemeController.class))
        .run(
            context ->
                assertThat(context)
                    .doesNotHaveBean(ThemeService.class)
                    .doesNotHaveBean(OwnerShellTheme.class));
  }

  @Test
  void without_jpa_there_is_no_owner_theme() {
    web.withClassLoader(new FilteredClassLoader(EntityManager.class))
        .run(context -> assertThat(context).doesNotHaveBean(ThemeService.class));
  }

  @Test
  void without_a_repository_there_is_no_owner_theme() {
    new WebApplicationContextRunner()
        .withConfiguration(AutoConfigurations.of(RouxThemeAutoConfiguration.class))
        .withPropertyValues("spring.application.name=dojo")
        .run(context -> assertThat(context).doesNotHaveBean(ThemeService.class));
  }

  @Test
  void a_non_web_app_gets_nothing() {
    new ApplicationContextRunner()
        .withConfiguration(AutoConfigurations.of(RouxThemeAutoConfiguration.class))
        .run(context -> assertThat(context).doesNotHaveBean(ThemeService.class));
  }

  private final ApplicationContextRunner persistence =
      new ApplicationContextRunner()
          .withConfiguration(AutoConfigurations.of(RouxThemePersistenceAutoConfiguration.class));

  @Test
  void the_entity_and_repository_are_found_without_the_apps_entity_scan() {
    persistence.run(
        context ->
            assertThat(AutoConfigurationPackages.get(context)).contains("org.jwcarman.roux.theme"));
  }

  @Test
  void without_jpa_there_is_nothing_to_find() {
    persistence
        .withClassLoader(new FilteredClassLoader(EntityManager.class))
        .run(context -> assertThat(AutoConfigurationPackages.has(context)).isFalse());
  }

  @Test
  void without_the_jar_there_is_nothing_to_find() {
    persistence
        .withClassLoader(new FilteredClassLoader(AppTheme.class))
        .run(context -> assertThat(AutoConfigurationPackages.has(context)).isFalse());
  }
}
