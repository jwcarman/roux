package org.jwcarman.roux.examples.dojo.persistence;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

/**
 * Fills the audit columns of every {@code AuditableEntity}: who from the identity, when from the
 * app's {@code Clock} (roux-autoconfigure wires it).
 */
@Configuration(proxyBeanMethods = false)
@EnableJpaAuditing(auditorAwareRef = "identityAuditor")
public class PersistenceConfig {

  @Bean
  IdentityAuditor identityAuditor() {
    return new IdentityAuditor();
  }
}
