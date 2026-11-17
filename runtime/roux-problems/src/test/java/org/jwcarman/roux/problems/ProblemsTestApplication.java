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

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;

/**
 * The application roux-problems' tests run: Spring MVC with Spring Boot's auto-configuration, and
 * no database. roux-problems is a library, so the advices and the error controller are wired here,
 * as roux-autoconfigure wires them in an application; the API path prefix comes from {@code
 * roux.problems.api-path-prefix}, {@code /api/} by default, as there. Spring Security is on the
 * classpath, so every request is let through here.
 */
@SpringBootConfiguration
@EnableAutoConfiguration(
    excludeName = {
      "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration",
      "org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration",
      // the tests sign in with spring-security-test's user(), so no generated password
      "org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration"
    })
@Import({
  RootProblemsAdvice.class,
  SecurityProblemsAdvice.class,
  WhoProblemsAdvice.class,
  PagingProblemsAdvice.class,
  ProblemErrorController.class
})
class ProblemsTestApplication {

  @Bean
  ProblemsAdvice problemsAdvice(@Value("${roux.problems.api-path-prefix:/api/}") String prefix) {
    return new ProblemsAdvice(prefix);
  }

  /** The application's clock, which {@code @NotInFuture} reads: the 15th of June, 2026. */
  @Bean
  Clock clock() {
    return Clock.fixed(Instant.parse("2026-06-15T12:00:00Z"), ZoneOffset.UTC);
  }

  @Bean
  SecurityFilterChain permitAll(HttpSecurity http) {
    return http.authorizeHttpRequests(requests -> requests.anyRequest().permitAll())
        .csrf(AbstractHttpConfigurer::disable)
        .build();
  }
}
