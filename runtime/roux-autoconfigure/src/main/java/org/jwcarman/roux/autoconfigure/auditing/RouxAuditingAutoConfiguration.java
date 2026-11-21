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
package org.jwcarman.roux.autoconfigure.auditing;

import java.time.Clock;

import org.jwcarman.roux.jpa.ClockDateTimeProvider;
import org.jwcarman.roux.jpa.IdentityAuditor;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.auditing.DateTimeProvider;
import org.springframework.data.domain.AuditorAware;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * Fills in JPA auditing, so an application writes a plain {@code @EnableJpaAuditing} and nothing
 * else: Spring Data's auditing handler takes the one {@link DateTimeProvider} and the one {@link
 * AuditorAware} bean by type.
 *
 * <ul>
 *   <li>Dates come from the application's {@link Clock} bean instead of the system clock, so a test
 *       that sets the clock sets {@code @CreatedDate} and {@code @LastModifiedDate} too (with a
 *       {@code Clock} bean, and no {@code DateTimeProvider} of the application's own).
 *   <li>{@code @CreatedBy} and {@code @LastModifiedBy} are the signed-in identity, or {@value
 *       IdentityAuditor#DEFAULT_SYSTEM_AUDITOR} ({@code roux.auditing.system-auditor}) for a change
 *       nobody signed in made ({@link IdentityAuditor}; with Spring Security, and no {@code
 *       AuditorAware} of the application's own).
 * </ul>
 *
 * Only with roux-jpa on the class path.
 */
@AutoConfiguration
@ConditionalOnClass({DateTimeProvider.class, ClockDateTimeProvider.class})
public class RouxAuditingAutoConfiguration {

  @Bean
  static AuditingHandlerWiring rouxAuditingHandlerWiring() {
    return new AuditingHandlerWiring();
  }

  @Bean
  @ConditionalOnBean(Clock.class)
  @ConditionalOnMissingBean(DateTimeProvider.class)
  DateTimeProvider auditingDateTimeProvider(Clock clock) {
    return new ClockDateTimeProvider(clock);
  }

  /** The auditor, where Spring Security says who is signed in. */
  @Configuration(proxyBeanMethods = false)
  @ConditionalOnClass(SecurityContextHolder.class)
  @EnableConfigurationProperties(RouxAuditingProperties.class)
  static class Auditor {

    @Bean
    @ConditionalOnMissingBean(AuditorAware.class)
    IdentityAuditor identityAuditor(RouxAuditingProperties properties) {
      return new IdentityAuditor(properties.systemAuditor());
    }
  }
}
