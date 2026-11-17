package org.jwcarman.roux.examples.dojo.persistence;

import java.time.Clock;
import java.util.Optional;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.auditing.DateTimeProvider;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

/**
 * Fills the audit columns of every {@code AuditableEntity}: who from the identity, when from the
 * app's clock.
 */
@Configuration(proxyBeanMethods = false)
@EnableJpaAuditing(
    auditorAwareRef = "identityAuditor",
    dateTimeProviderRef = "auditingDateTimeProvider")
public class PersistenceConfig {

  /** The audit dates come from the app's {@link Clock}, so a test that sets the clock sets them. */
  @Bean
  DateTimeProvider auditingDateTimeProvider(Clock clock) {
    return () -> Optional.of(clock.instant());
  }

  @Bean
  IdentityAuditor identityAuditor() {
    return new IdentityAuditor();
  }
}
