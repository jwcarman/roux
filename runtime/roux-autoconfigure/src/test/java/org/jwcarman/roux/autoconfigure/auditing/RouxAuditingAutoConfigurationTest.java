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

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.AbstractBeanDefinition;
import org.springframework.beans.factory.support.BeanDefinitionBuilder;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.FilteredClassLoader;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.auditing.AuditingHandler;
import org.springframework.data.auditing.DateTimeProvider;
import org.springframework.data.domain.Auditable;
import org.springframework.data.mapping.context.PersistentEntities;

class RouxAuditingAutoConfigurationTest {

  private static final Instant NOW = Instant.parse("2026-03-04T05:06:07Z");

  private final ApplicationContextRunner runner =
      new ApplicationContextRunner()
          .withConfiguration(AutoConfigurations.of(RouxAuditingAutoConfiguration.class));

  @Configuration(proxyBeanMethods = false)
  static class WithAClock {

    @Bean
    Clock clock() {
      return Clock.fixed(NOW, ZoneOffset.UTC);
    }
  }

  @Configuration(proxyBeanMethods = false)
  static class WithAProviderOfItsOwn {

    static final Instant OWN = Instant.parse("1999-01-01T00:00:00Z");

    @Bean
    DateTimeProvider ownProvider() {
      return () -> Optional.of(OWN);
    }
  }

  /** What {@code @EnableJpaAuditing} registers: a handler whose properties are set by type. */
  @Configuration(proxyBeanMethods = false)
  static class WithAnAuditingHandler {

    @Bean
    PersistentEntities persistentEntities() {
      return PersistentEntities.of();
    }

    @Bean
    static org.springframework.beans.factory.config.BeanFactoryPostProcessor handler() {
      return beanFactory ->
          ((org.springframework.beans.factory.support.BeanDefinitionRegistry) beanFactory)
              .registerBeanDefinition(
                  "jpaAuditingHandler",
                  BeanDefinitionBuilder.rootBeanDefinition(AuditingHandler.class)
                      .setAutowireMode(AbstractBeanDefinition.AUTOWIRE_BY_TYPE)
                      .addConstructorArgReference("persistentEntities")
                      .getBeanDefinition());
    }
  }

  /** The simplest thing the auditing handler stamps: it needs no mapping context. */
  static class Visit implements Auditable<String, Long, Instant> {

    private Instant createdDate;
    private Instant lastModifiedDate;

    @Override
    public Long getId() {
      return 1L;
    }

    @Override
    public boolean isNew() {
      return false;
    }

    @Override
    public Optional<String> getCreatedBy() {
      return Optional.empty();
    }

    @Override
    public void setCreatedBy(String createdBy) {}

    @Override
    public Optional<Instant> getCreatedDate() {
      return Optional.ofNullable(createdDate);
    }

    @Override
    public void setCreatedDate(Instant createdDate) {
      this.createdDate = createdDate;
    }

    @Override
    public Optional<String> getLastModifiedBy() {
      return Optional.empty();
    }

    @Override
    public void setLastModifiedBy(String lastModifiedBy) {}

    @Override
    public Optional<Instant> getLastModifiedDate() {
      return Optional.ofNullable(lastModifiedDate);
    }

    @Override
    public void setLastModifiedDate(Instant lastModifiedDate) {
      this.lastModifiedDate = lastModifiedDate;
    }
  }

  @Test
  void datesComeFromTheClockBean() {
    runner
        .withUserConfiguration(WithAClock.class)
        .run(
            context -> {
              DateTimeProvider provider = context.getBean(DateTimeProvider.class);

              assertThat(provider.getNow()).contains(NOW);
            });
  }

  @Test
  void anAuditingHandlerStampsFromTheClock() {
    runner
        .withUserConfiguration(WithAClock.class, WithAnAuditingHandler.class)
        .run(
            context -> {
              Visit visit = new Visit();

              context.getBean(AuditingHandler.class).markCreated(visit);

              assertThat(visit.getCreatedDate()).contains(NOW);
            });
  }

  @Test
  void withoutAClockItDoesNothing() {
    runner.run(context -> assertThat(context).doesNotHaveBean(DateTimeProvider.class));
  }

  @Test
  void anApplicationsOwnProviderStays() {
    runner
        .withUserConfiguration(WithAClock.class, WithAProviderOfItsOwn.class)
        .run(
            context ->
                assertThat(context.getBean(DateTimeProvider.class).getNow())
                    .contains(WithAProviderOfItsOwn.OWN));
  }

  @Test
  void withoutSpringDataItDoesNothing() {
    runner
        .withUserConfiguration(WithAClock.class)
        .withClassLoader(new FilteredClassLoader(DateTimeProvider.class))
        .run(context -> assertThat(context).doesNotHaveBean("auditingDateTimeProvider"));
  }
}
