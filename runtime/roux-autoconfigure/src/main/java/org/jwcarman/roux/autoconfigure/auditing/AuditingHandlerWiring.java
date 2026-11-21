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

import org.springframework.beans.MutablePropertyValues;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.beans.factory.config.RuntimeBeanReference;
import org.springframework.data.auditing.AuditingHandler;
import org.springframework.data.auditing.DateTimeProvider;
import org.springframework.data.domain.AuditorAware;

/**
 * Gives each auditing handler its auditor and clock by name. {@code @EnableJpaAuditing} without an
 * {@code auditorAwareRef} leaves them to be set by type, which an ahead-of-time (native) build does
 * not keep: there the handler would stamp no auditor and ignore the app's {@code Clock}. A handler
 * already given one by name keeps it, and a type with no single bean is left as it was.
 */
final class AuditingHandlerWiring implements BeanFactoryPostProcessor {

  @Override
  public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) {
    for (String handler : beanFactory.getBeanNamesForType(AuditingHandler.class, true, false)) {
      MutablePropertyValues properties = beanFactory.getBeanDefinition(handler).getPropertyValues();
      wire(beanFactory, properties, "auditorAware", AuditorAware.class);
      wire(beanFactory, properties, "dateTimeProvider", DateTimeProvider.class);
    }
  }

  private static void wire(
      ConfigurableListableBeanFactory beanFactory,
      MutablePropertyValues properties,
      String property,
      Class<?> type) {
    String[] candidates = beanFactory.getBeanNamesForType(type, true, false);
    if (candidates.length == 1 && !properties.contains(property)) {
      properties.add(property, new RuntimeBeanReference(candidates[0]));
    }
  }
}
