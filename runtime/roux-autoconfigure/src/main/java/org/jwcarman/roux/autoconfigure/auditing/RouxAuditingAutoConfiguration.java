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
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.data.auditing.DateTimeProvider;

/**
 * Makes JPA auditing stamp its dates from the application's {@link Clock} bean instead of the
 * system clock, so a test that sets the clock sets {@code @CreatedDate} and
 * {@code @LastModifiedDate} too. An application writes {@code @EnableJpaAuditing(auditorAwareRef =
 * ...)} and nothing about dates: Spring Data's auditing handler takes the one {@link
 * DateTimeProvider} bean by type. With no {@code Clock} bean, or a {@code DateTimeProvider} of the
 * application's own, this does nothing. Only with roux-jpa on the class path.
 */
@AutoConfiguration
@ConditionalOnClass({DateTimeProvider.class, ClockDateTimeProvider.class})
public class RouxAuditingAutoConfiguration {

  @Bean
  @ConditionalOnBean(Clock.class)
  @ConditionalOnMissingBean(DateTimeProvider.class)
  DateTimeProvider auditingDateTimeProvider(Clock clock) {
    return new ClockDateTimeProvider(clock);
  }
}
