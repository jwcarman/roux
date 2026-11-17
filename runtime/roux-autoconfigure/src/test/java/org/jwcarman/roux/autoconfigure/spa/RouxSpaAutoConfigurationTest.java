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

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.jwcarman.who.spring.security.WhoPublicPathContributor;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.FilteredClassLoader;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.core.io.ClassPathResource;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@DisplayNameGeneration(ReplaceUnderscores.class)
class RouxSpaAutoConfigurationTest {

  private final WebApplicationContextRunner web =
      new WebApplicationContextRunner()
          .withConfiguration(AutoConfigurations.of(RouxSpaAutoConfiguration.class));

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
                    .doesNotHaveBean(WhoPublicPathContributor.class));
  }

  @Test
  void a_non_web_app_gets_nothing() {
    new ApplicationContextRunner()
        .withConfiguration(AutoConfigurations.of(RouxSpaAutoConfiguration.class))
        .run(context -> assertThat(context).doesNotHaveBean("spaFallbackFilter"));
  }

  @Test
  void the_property_turns_it_off() {
    web.withPropertyValues("roux.spa.enabled=false")
        .run(context -> assertThat(context).doesNotHaveBean("spaFallbackFilter"));
  }

  @Test
  void the_shell_and_assets_are_contributed_as_public_paths() {
    web.run(
        context ->
            assertThat(context.getBeansOfType(WhoPublicPathContributor.class).values())
                .flatMap(WhoPublicPathContributor::publicPaths)
                .containsExactly("/index.html", "/assets/**"));
  }

  @Test
  void an_app_without_who_has_no_public_paths_to_extend() {
    web.withClassLoader(new FilteredClassLoader(WhoPublicPathContributor.class))
        .run(context -> assertThat(context).hasBean("spaFallbackFilter"));
  }
}
