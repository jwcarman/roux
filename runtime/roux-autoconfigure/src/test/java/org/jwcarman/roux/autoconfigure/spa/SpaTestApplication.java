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

import org.jwcarman.who.spring.security.WhoPublicPaths;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.SpringBootConfiguration;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * An application with a built frontend ({@code static/index.html}) and who's way of securing it:
 * the public paths open, everything else signed in. It lists no page.
 */
@SpringBootConfiguration
@EnableAutoConfiguration(
    excludeName = {
      "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration",
      "org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration",
      "org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration"
    })
class SpaTestApplication {

  @Bean
  SecurityFilterChain publicPathsOpen(
      HttpSecurity http, ObjectProvider<WhoPublicPaths> publicPaths) {
    return http.authorizeHttpRequests(
            requests -> {
              publicPaths.ifAvailable(
                  paths -> requests.requestMatchers(paths.patterns()).permitAll());
              requests.anyRequest().authenticated();
            })
        .exceptionHandling(
            handling ->
                handling.authenticationEntryPoint(
                    new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
        .csrf(AbstractHttpConfigurer::disable)
        .build();
  }

  @RestController
  static class PingController {

    @GetMapping("/api/ping")
    ResponseEntity<String> ping() {
      return ResponseEntity.ok("pong");
    }

    @GetMapping("/legacy/report")
    ResponseEntity<String> report() {
      return ResponseEntity.ok("a server-rendered page");
    }
  }
}
