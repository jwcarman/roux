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
import org.jwcarman.jpa.pagination.UnknownSortByValueException;
import org.jwcarman.roux.problems.PagingProblemsAdvice;
import org.jwcarman.roux.problems.ProblemErrorController;
import org.jwcarman.roux.problems.ProblemsAdvice;
import org.jwcarman.roux.problems.RootProblemsAdvice;
import org.jwcarman.roux.problems.SecurityProblemsAdvice;
import org.jwcarman.roux.problems.WhoProblemsAdvice;
import org.jwcarman.who.spring.security.web.SignInFailedException;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.FilteredClassLoader;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.context.runner.WebApplicationContextRunner;
import org.springframework.boot.webmvc.autoconfigure.DispatcherServletAutoConfiguration;
import org.springframework.boot.webmvc.autoconfigure.error.ErrorMvcAutoConfiguration;
import org.springframework.boot.webmvc.error.ErrorController;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.access.AccessDeniedException;

class RouxProblemsAutoConfigurationTest {

  private final WebApplicationContextRunner web =
      new WebApplicationContextRunner()
          .withConfiguration(
              AutoConfigurations.of(
                  RouxProblemsAutoConfiguration.class,
                  DispatcherServletAutoConfiguration.class,
                  ErrorMvcAutoConfiguration.class));

  @Configuration(proxyBeanMethods = false)
  static class UserErrorController {
    static final ErrorController CONTROLLER = new ErrorController() {};

    @Bean
    ErrorController errorController() {
      return CONTROLLER;
    }
  }

  @Configuration(proxyBeanMethods = false)
  static class UserProblemsAdvice {
    static final ProblemsAdvice ADVICE = new ProblemsAdvice("/api/");

    @Bean
    ProblemsAdvice userProblemsAdvice() {
      return ADVICE;
    }
  }

  @Test
  void registersAdviceAndErrorController() {
    web.run(
        context -> {
          assertThat(context)
              .hasSingleBean(ProblemsAdvice.class)
              .hasSingleBean(RootProblemsAdvice.class)
              .hasSingleBean(ProblemErrorController.class)
              .hasSingleBean(ErrorController.class);
          // a factory method that returned null would still pass the checks above
          assertThat(context.getBean(ProblemsAdvice.class)).isNotNull();
          assertThat(context.getBean(RootProblemsAdvice.class)).isNotNull();
          assertThat(context.getBean(ErrorController.class))
              .isInstanceOf(ProblemErrorController.class);
        });
  }

  @Test
  void disabledByProperty() {
    web.withPropertyValues("roux.problems.enabled=false")
        .run(
            context ->
                assertThat(context)
                    .doesNotHaveBean(ProblemsAdvice.class)
                    .doesNotHaveBean(RootProblemsAdvice.class)
                    .doesNotHaveBean(ProblemErrorController.class));
  }

  @Test
  void backsOffForUserErrorController() {
    web.withUserConfiguration(UserErrorController.class)
        .run(
            context -> {
              assertThat(context)
                  .doesNotHaveBean(ProblemErrorController.class)
                  .hasSingleBean(ProblemsAdvice.class);
              assertThat(context.getBean(ErrorController.class))
                  .isSameAs(UserErrorController.CONTROLLER);
            });
  }

  @Test
  void backsOffForUserProblemsAdvice() {
    web.withUserConfiguration(UserProblemsAdvice.class)
        .run(
            context -> {
              assertThat(context).hasSingleBean(ProblemsAdvice.class);
              assertThat(context.getBean(ProblemsAdvice.class)).isSameAs(UserProblemsAdvice.ADVICE);
            });
  }

  @Test
  void notInNonWebApplication() {
    new ApplicationContextRunner()
        .withConfiguration(AutoConfigurations.of(RouxProblemsAutoConfiguration.class))
        .run(
            context ->
                assertThat(context)
                    .doesNotHaveBean(ProblemsAdvice.class)
                    .doesNotHaveBean(RootProblemsAdvice.class)
                    .doesNotHaveBean(ProblemErrorController.class));
  }

  @Test
  void withoutWhoNoWhoAdvice() {
    web.withClassLoader(new FilteredClassLoader(SignInFailedException.class))
        .run(
            context ->
                assertThat(context)
                    .hasNotFailed()
                    .doesNotHaveBean(WhoProblemsAdvice.class)
                    .hasSingleBean(SecurityProblemsAdvice.class));
  }

  @Test
  void withoutSecurityNoSecurityAdvice() {
    web.withClassLoader(new FilteredClassLoader(AccessDeniedException.class))
        .run(
            context ->
                assertThat(context)
                    .hasNotFailed()
                    .doesNotHaveBean(SecurityProblemsAdvice.class)
                    .doesNotHaveBean(WhoProblemsAdvice.class)
                    .hasSingleBean(ProblemsAdvice.class));
  }

  @Test
  void withoutJpaUtilsNoPagingAdvice() {
    web.withClassLoader(new FilteredClassLoader(UnknownSortByValueException.class))
        .run(
            context ->
                assertThat(context)
                    .hasNotFailed()
                    .doesNotHaveBean(PagingProblemsAdvice.class)
                    .hasSingleBean(ProblemsAdvice.class));
  }

  @Test
  void withEverythingAllThree() {
    web.run(
        context -> {
          assertThat(context)
              .hasSingleBean(WhoProblemsAdvice.class)
              .hasSingleBean(SecurityProblemsAdvice.class)
              .hasSingleBean(PagingProblemsAdvice.class);
          assertThat(context.getBean(WhoProblemsAdvice.class)).isNotNull();
          assertThat(context.getBean(SecurityProblemsAdvice.class)).isNotNull();
          assertThat(context.getBean(PagingProblemsAdvice.class)).isNotNull();
        });
  }

  @Test
  void notWithoutRouxProblems() {
    web.withClassLoader(new FilteredClassLoader(ProblemsAdvice.class))
        .run(
            context ->
                assertThat(context)
                    .hasNotFailed()
                    .doesNotHaveBean(ProblemsAdvice.class)
                    .doesNotHaveBean(RootProblemsAdvice.class)
                    .doesNotHaveBean(ProblemErrorController.class)
                    .doesNotHaveBean(SecurityProblemsAdvice.class)
                    .doesNotHaveBean(WhoProblemsAdvice.class)
                    .doesNotHaveBean(PagingProblemsAdvice.class));
  }
}
