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
package org.jwcarman.roux.problems;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBooleanProperty;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication.Type;
import org.springframework.boot.autoconfigure.web.WebProperties;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.webmvc.autoconfigure.error.ErrorMvcAutoConfiguration;
import org.springframework.boot.webmvc.autoconfigure.error.ErrorViewResolver;
import org.springframework.boot.webmvc.error.ErrorAttributes;
import org.springframework.boot.webmvc.error.ErrorController;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ImportRuntimeHints;

/**
 * Answers a servlet application's errors as Problem Details: the advices, and the error page that
 * answers a JSON client with a problem. Ahead of Spring Boot's error handling, so its error
 * controller gives way to this one. Off with {@code roux.problems.enabled=false}; an application's
 * own bean of any of the three takes that one's place.
 */
@AutoConfiguration(before = ErrorMvcAutoConfiguration.class)
@ConditionalOnWebApplication(type = Type.SERVLET)
@ConditionalOnBooleanProperty(name = "roux.problems.enabled", matchIfMissing = true)
@EnableConfigurationProperties(RouxProblemsProperties.class)
@ImportRuntimeHints(ProblemsRuntimeHints.class)
public class RouxProblemsAutoConfiguration {

  @Bean
  @ConditionalOnMissingBean
  ProblemsAdvice problemsAdvice(RouxProblemsProperties properties) {
    return new ProblemsAdvice(properties);
  }

  @Bean
  @ConditionalOnMissingBean
  RootProblemsAdvice rootProblemsAdvice() {
    return new RootProblemsAdvice();
  }

  @Bean
  @ConditionalOnMissingBean(ErrorController.class)
  ProblemErrorController problemErrorController(
      ErrorAttributes errorAttributes,
      WebProperties webProperties,
      ObjectProvider<ErrorViewResolver> errorViewResolvers) {
    return new ProblemErrorController(errorAttributes, webProperties, errorViewResolvers);
  }
}
