package org.jwcarman.roux.examples.dojo.persistence;

import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

/**
 * Fills the audit columns of every {@code AuditableEntity}: who from the signed-in identity, when
 * from the app's {@code Clock} (roux wires both).
 */
@Configuration(proxyBeanMethods = false)
@EnableJpaAuditing
public class PersistenceConfig {}
