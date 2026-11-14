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

import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;

/**
 * An application that gets roux-problems from the auto-configuration alone, as an application does:
 * it scans nothing, and imports only the controller that raises the errors. Spring Security is on
 * the classpath, so every request is let through here.
 */
@SpringBootConfiguration
@EnableAutoConfiguration(
    excludeName = {
      "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration",
      "org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration",
      // the tests sign in with spring-security-test's user(), so no generated password
      "org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration"
    })
@Import(ErrorsTestController.class)
class ProblemsAutoConfigurationTestApplication {

  @Bean
  SecurityFilterChain permitAll(HttpSecurity http) {
    return http.authorizeHttpRequests(requests -> requests.anyRequest().permitAll())
        .csrf(AbstractHttpConfigurer::disable)
        .build();
  }
}
