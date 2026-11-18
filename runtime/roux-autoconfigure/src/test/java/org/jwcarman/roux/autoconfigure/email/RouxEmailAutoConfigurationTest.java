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
package org.jwcarman.roux.autoconfigure.email;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.email.RouxEmailModelContributor;
import org.jwcarman.roux.spa.ShellTheme;
import org.jwcarman.roux.spa.ShellThemeSource;
import org.jwcarman.who.email.WhoEmailTemplates;
import org.springframework.aot.hint.RuntimeHints;
import org.springframework.aot.hint.predicate.RuntimeHintsPredicates;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.FilteredClassLoader;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

@DisplayNameGeneration(ReplaceUnderscores.class)
class RouxEmailAutoConfigurationTest {

  private final ApplicationContextRunner runner =
      new ApplicationContextRunner()
          .withConfiguration(AutoConfigurations.of(RouxEmailAutoConfiguration.class))
          .withBean(ShellThemeSource.class, () -> () -> ShellTheme.stock("Dojo"));

  @Test
  void the_templates_and_the_contributor_are_registered() {
    runner.run(
        context -> {
          assertThat(context).hasSingleBean(RouxEmailModelContributor.class);
          assertThat(context.getBean(WhoEmailTemplates.class))
              .isEqualTo(
                  new WhoEmailTemplates(
                      "classpath:/org/jwcarman/roux/email/",
                      "org/jwcarman/roux/email/email-messages"));
        });
  }

  @Test
  void the_contributor_reads_the_shell_theme() {
    runner.run(
        context ->
            assertThat(context.getBean(RouxEmailModelContributor.class).extra(null))
                .containsKey("roux"));
  }

  @Test
  void without_a_shell_theme_who_s_own_emails_stay() {
    new ApplicationContextRunner()
        .withConfiguration(AutoConfigurations.of(RouxEmailAutoConfiguration.class))
        .run(
            context ->
                assertThat(context)
                    .doesNotHaveBean(RouxEmailModelContributor.class)
                    .doesNotHaveBean(WhoEmailTemplates.class));
  }

  @Test
  void without_who_email_nothing_is_registered() {
    runner
        .withClassLoader(new FilteredClassLoader(WhoEmailTemplates.class))
        .run(context -> assertThat(context).doesNotHaveBean(RouxEmailModelContributor.class));
  }

  @Test
  void the_templates_and_the_bundle_are_native_image_resources() {
    RuntimeHints hints = new RuntimeHints();

    new RouxEmailAutoConfiguration.Hints().registerHints(hints, getClass().getClassLoader());

    assertThat(RuntimeHintsPredicates.resource().forResource("org/jwcarman/roux/email/sign-in.txt"))
        .accepts(hints);
    assertThat(
            RuntimeHintsPredicates.resource().forResource("org/jwcarman/roux/email/sign-in.html"))
        .accepts(hints);
    assertThat(
            RuntimeHintsPredicates.resource()
                .forResource("org/jwcarman/roux/email/email-messages.properties"))
        .accepts(hints);
    assertThat(
            RuntimeHintsPredicates.resource().forBundle("org.jwcarman.roux.email.email-messages"))
        .accepts(hints);
    assertThat(RuntimeHintsPredicates.resource().forResource("org/jwcarman/who/email/other.txt"))
        .rejects(hints);
  }
}
