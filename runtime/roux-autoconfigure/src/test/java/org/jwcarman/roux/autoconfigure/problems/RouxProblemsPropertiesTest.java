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
package org.jwcarman.roux.autoconfigure.problems;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;

class RouxProblemsPropertiesTest {

  @Configuration(proxyBeanMethods = false)
  @EnableConfigurationProperties(RouxProblemsProperties.class)
  static class Bound {}

  private final ApplicationContextRunner runner =
      new ApplicationContextRunner().withUserConfiguration(Bound.class);

  @Test
  void defaultsToEnabledUnderApi() {
    runner.run(
        context -> {
          RouxProblemsProperties properties = context.getBean(RouxProblemsProperties.class);
          assertThat(properties.enabled()).isTrue();
          assertThat(properties.apiPathPrefix()).isEqualTo("/api/");
        });
  }

  @Test
  void bindsFromRouxProblems() {
    runner
        .withPropertyValues("roux.problems.enabled=false", "roux.problems.api-path-prefix=/rest/")
        .run(
            context -> {
              RouxProblemsProperties properties = context.getBean(RouxProblemsProperties.class);
              assertThat(properties.enabled()).isFalse();
              assertThat(properties.apiPathPrefix()).isEqualTo("/rest/");
            });
  }
}
