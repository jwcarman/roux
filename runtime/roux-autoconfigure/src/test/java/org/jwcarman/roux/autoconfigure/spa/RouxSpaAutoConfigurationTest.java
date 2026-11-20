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

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.autoconfigure.organization.RouxOrganizationAutoConfiguration;
import org.jwcarman.roux.spa.ShellPage;
import org.jwcarman.roux.spa.ShellTheme;
import org.jwcarman.roux.spa.ShellThemeSource;
import org.jwcarman.roux.spa.SpaFallbackFilter;
import org.jwcarman.who.spring.security.WhoPublicPathContributor;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.FilteredClassLoader;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.DefaultResourceLoader;
import org.springframework.core.io.Resource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.function.RouterFunction;

import tools.jackson.databind.json.JsonMapper;

@DisplayNameGeneration(ReplaceUnderscores.class)
class RouxSpaAutoConfigurationTest {

  private final WebApplicationContextRunner web =
      new WebApplicationContextRunner()
          .withConfiguration(
              AutoConfigurations.of(
                  RouxOrganizationAutoConfiguration.class, RouxSpaAutoConfiguration.class))
          .withPropertyValues(
              "spring.application.name=dojo",
              "roux.organization.time-zone=America/New_York",
              "roux.organization.locale=en-US");

  @Test
  void a_servlet_app_with_a_built_frontend_serves_the_shell() {
    web.run(
        context -> {
          assertThat(context).hasBean("spaFallbackFilter");
          assertThat(context.getBean("spaAssets")).isInstanceOf(WebMvcConfigurer.class);
        });
  }

  @Test
  void the_filter_runs_ahead_of_spring_security() {
    web.run(
        context ->
            assertThat(
                    context.getBean("spaFallbackFilter", FilterRegistrationBean.class).getOrder())
                .isEqualTo(-101));
  }

  @Test
  void an_app_without_an_index_html_gets_nothing() {
    web.withClassLoader(new FilteredClassLoader(new ClassPathResource("static/index.html")))
        .run(
            context ->
                assertThat(context)
                    .doesNotHaveBean("spaFallbackFilter")
                    .doesNotHaveBean("spaPublicPaths"));
  }

  @Test
  void a_non_web_app_gets_nothing() {
    new ApplicationContextRunner()
        .withConfiguration(AutoConfigurations.of(RouxSpaAutoConfiguration.class))
        .run(context -> assertThat(context).doesNotHaveBean("spaFallbackFilter"));
  }

  @Test
  void without_the_roux_spa_jar_there_is_nothing_to_serve() {
    web.withClassLoader(new FilteredClassLoader(SpaFallbackFilter.class))
        .run(context -> assertThat(context).doesNotHaveBean("spaFallbackFilter"));
  }

  @Test
  void the_shell_and_assets_are_contributed_as_public_paths() {
    web.run(
        context ->
            assertThat(
                    context.getBean("spaPublicPaths", WhoPublicPathContributor.class).publicPaths())
                .containsExactly("/index.html", "/assets/**"));
  }

  @Test
  void an_app_without_who_has_no_public_paths_to_extend() {
    web.withClassLoader(new FilteredClassLoader(WhoPublicPathContributor.class))
        .run(context -> assertThat(context).hasBean("spaFallbackFilter"));
  }

  @Test
  void the_shell_is_served_by_a_route_over_the_page_the_frontend_built() {
    web.run(
        context -> {
          assertThat(context).hasSingleBean(ShellPage.class);
          assertThat(context.getBean("rouxShellRoutes")).isInstanceOf(RouterFunction.class);
          assertThat(context.getBean(ShellPage.class).render(new MockHttpServletRequest()))
              .contains("<title>dojo</title>")
              .contains("\"palette\":\"gray\"");
        });
  }

  @Test
  void the_look_comes_from_the_roux_theme_properties_and_the_application_name() {
    web.withPropertyValues("roux.theme.palette=teal", "roux.theme.shape=round")
        .run(
            context ->
                assertThat(context.getBean(ShellThemeSource.class).current())
                    .isEqualTo(
                        new ShellTheme(
                            "dojo", "teal", "#3b82f6", "round", "standard", "standard")));
  }

  @Test
  void the_app_name_property_beats_the_application_name() {
    web.withPropertyValues("roux.theme.app-name=Dojo & Co")
        .run(
            context ->
                assertThat(context.getBean(ShellThemeSource.class).current().appName())
                    .isEqualTo("Dojo & Co"));
  }

  @Test
  void an_app_with_no_name_at_all_does_not_start_and_says_what_to_set() {
    new WebApplicationContextRunner()
        .withConfiguration(AutoConfigurations.of(RouxSpaAutoConfiguration.class))
        .run(
            context ->
                assertThat(context)
                    .hasFailed()
                    .getFailure()
                    .rootCause()
                    .hasMessageContaining("roux.theme.app-name or spring.application.name"));
  }

  @Test
  void a_value_the_frontend_has_no_look_for_does_not_start() {
    web.withPropertyValues("roux.theme.palette=mauve")
        .run(
            context ->
                assertThat(context)
                    .hasFailed()
                    .getFailure()
                    .rootCause()
                    .hasMessageContaining("palette 'mauve'"));
  }

  @Test
  void a_source_of_the_apps_own_replaces_the_properties() {
    web.withBean(ShellThemeSource.class, () -> () -> ShellTheme.stock("Mine"))
        .run(
            context -> {
              assertThat(context).hasSingleBean(ShellThemeSource.class);
              assertThat(context.getBean(ShellPage.class).render(new MockHttpServletRequest()))
                  .contains("<title>Mine</title>");
            });
  }

  @Test
  void the_policy_is_strict_until_the_properties_add_to_it() {
    web.run(
        context ->
            assertThat(context.getBean(ShellPage.class).policyFor(new MockHttpServletRequest()))
                .contains("img-src 'self' data:; ")
                .contains("connect-src 'self'; "));
    web.withPropertyValues(
            "roux.spa.csp.img-src=https://img.example.com",
            "roux.spa.csp.connect-src=https://api.example.com,wss://live.example.com")
        .run(
            context ->
                assertThat(context.getBean(ShellPage.class).policyFor(new MockHttpServletRequest()))
                    .contains("img-src 'self' data: https://img.example.com; ")
                    .contains("connect-src 'self' https://api.example.com wss://live.example.com; ")
                    .contains("default-src 'self'; ")
                    .contains("script-src 'self' 'nonce-"));
  }

  @Test
  void every_directive_has_a_property_that_adds_to_it() {
    web.withPropertyValues(
            "roux.spa.csp.script-src=https://s.example.com",
            "roux.spa.csp.style-src=https://st.example.com",
            "roux.spa.csp.img-src=https://i.example.com",
            "roux.spa.csp.font-src=https://f.example.com",
            "roux.spa.csp.connect-src=https://c.example.com",
            "roux.spa.csp.frame-src=https://fr.example.com",
            "roux.spa.csp.media-src=https://m.example.com",
            "roux.spa.csp.form-action=https://fa.example.com")
        .run(
            context ->
                assertThat(context.getBean(ShellPage.class).policyFor(new MockHttpServletRequest()))
                    .containsSubsequence(
                        "script-src 'self' 'nonce-",
                        "https://s.example.com; style-src 'self' 'nonce-",
                        "https://st.example.com; img-src 'self' data: https://i.example.com; "
                            + "font-src 'self' https://f.example.com; "
                            + "connect-src 'self' https://c.example.com; "
                            + "frame-src 'self' https://fr.example.com; "
                            + "media-src 'self' https://m.example.com; "
                            + "form-action 'self' https://fa.example.com; object-src 'none'"));
  }

  @Test
  void a_setting_that_would_loosen_the_policy_stops_the_app_from_starting() {
    web.withPropertyValues("roux.spa.csp.script-src='unsafe-inline'")
        .run(
            context ->
                assertThat(context)
                    .hasFailed()
                    .getFailure()
                    .rootCause()
                    .hasMessageContaining("roux.spa.csp.script-src: ''unsafe-inline''"));
  }

  @Test
  void a_page_without_the_placeholders_stops_the_app_from_starting() {
    web.withInitializer(
            context ->
                ((GenericApplicationContext) context)
                    .setResourceLoader(
                        new DefaultResourceLoader() {
                          @Override
                          public Resource getResource(String location) {
                            return location.equals("classpath:/static/index.html")
                                ? new ByteArrayResource("<html></html>".getBytes(UTF_8))
                                : super.getResource(location);
                          }
                        }))
        .run(
            context ->
                assertThat(context)
                    .hasFailed()
                    .getFailure()
                    .rootCause()
                    .hasMessageContaining("index.html has no __CSP_NONCE__"));
  }

  @Test
  void the_theme_is_written_with_the_apps_json_mapper_when_there_is_one() {
    web.withBean(JsonMapper.class, () -> JsonMapper.builder().build())
        .run(context -> assertThat(context).hasSingleBean(ShellPage.class));
  }
}
