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

import org.jwcarman.roux.autoconfigure.spa.RouxSpaAutoConfiguration;
import org.jwcarman.roux.email.RouxEmail;
import org.jwcarman.roux.email.RouxEmailModelContributor;
import org.jwcarman.roux.spa.ShellThemeSource;
import org.jwcarman.who.email.WhoEmailTemplates;
import org.springframework.aot.hint.RuntimeHints;
import org.springframework.aot.hint.RuntimeHintsRegistrar;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ImportRuntimeHints;

/**
 * roux's finished emails, with roux-email and who-email on the class path: who's five emails in
 * roux's words and HTML, naming the app. It registers the templates and subjects as a {@link
 * WhoEmailTemplates} library (an app's own templates and messages still win, one file at a time)
 * and a {@link RouxEmailModelContributor} that gives every email {@code extra.roux} from the
 * shell's theme. It needs a {@link ShellThemeSource}; without one who's own emails go out
 * unchanged.
 */
@AutoConfiguration(
    after = RouxSpaAutoConfiguration.class,
    afterName = "org.jwcarman.roux.autoconfigure.theme.RouxThemeAutoConfiguration")
@ConditionalOnClass({RouxEmailModelContributor.class, WhoEmailTemplates.class})
@ConditionalOnBean(ShellThemeSource.class)
@ImportRuntimeHints(RouxEmailAutoConfiguration.Hints.class)
public class RouxEmailAutoConfiguration {

  @Bean
  RouxEmailModelContributor rouxEmailModelContributor(ShellThemeSource themes) {
    return new RouxEmailModelContributor(themes);
  }

  @Bean
  WhoEmailTemplates rouxEmailTemplates() {
    return new WhoEmailTemplates(RouxEmail.TEMPLATES, RouxEmail.MESSAGES);
  }

  /** The templates and the subjects bundle, for a native image. */
  static class Hints implements RuntimeHintsRegistrar {

    @Override
    public void registerHints(RuntimeHints hints, ClassLoader classLoader) {
      hints.resources().registerPattern("org/jwcarman/roux/email/*");
      hints.resources().registerResourceBundle(RouxEmail.MESSAGES.replace('/', '.'));
    }
  }
}
