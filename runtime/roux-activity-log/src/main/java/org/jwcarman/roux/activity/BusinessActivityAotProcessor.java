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
package org.jwcarman.roux.activity;

import java.util.ArrayList;
import java.util.List;

import org.springframework.aot.hint.BindingReflectionHintsRegistrar;
import org.springframework.beans.factory.annotation.AnnotatedBeanDefinition;
import org.springframework.beans.factory.aot.BeanFactoryInitializationAotContribution;
import org.springframework.beans.factory.aot.BeanFactoryInitializationAotProcessor;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.boot.autoconfigure.AutoConfigurationPackages;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AssignableTypeFilter;
import org.springframework.util.ClassUtils;

/**
 * What a native image needs for the activity log: {@link ActivityLog#append} writes an activity's
 * components as JSON, by reflection on the record. Ahead of time, this finds every {@link
 * BusinessActivity} record in roux's packages and the app's (its auto-configuration packages,
 * {@code @SpringBootApplication}'s) and registers it as Jackson binds it, so an app declares
 * nothing for its own activities.
 */
public class BusinessActivityAotProcessor implements BeanFactoryInitializationAotProcessor {

  private static final String ROUX = "org.jwcarman.roux";

  @Override
  public BeanFactoryInitializationAotContribution processAheadOfTime(
      ConfigurableListableBeanFactory beanFactory) {
    List<String> packages = new ArrayList<>(List.of(ROUX));
    if (AutoConfigurationPackages.has(beanFactory)) {
      packages.addAll(AutoConfigurationPackages.get(beanFactory));
    }
    ClassLoader classLoader = beanFactory.getBeanClassLoader();
    List<Class<?>> records =
        packages.stream()
            .flatMap(base -> activitiesIn(base).stream())
            .<Class<?>>map(name -> ClassUtils.resolveClassName(name, classLoader))
            .filter(Class::isRecord)
            .distinct()
            .toList();
    BindingReflectionHintsRegistrar binding = new BindingReflectionHintsRegistrar();
    return (context, code) ->
        records.forEach(
            type -> binding.registerReflectionHints(context.getRuntimeHints().reflection(), type));
  }

  /** The names of the classes under {@code base} that are business activities. */
  private static List<String> activitiesIn(String base) {
    ClassPathScanningCandidateComponentProvider scanner =
        new ClassPathScanningCandidateComponentProvider(false) {
          @Override
          protected boolean isCandidateComponent(AnnotatedBeanDefinition definition) {
            return true;
          }
        };
    scanner.addIncludeFilter(new AssignableTypeFilter(BusinessActivity.class));
    return scanner.findCandidateComponents(base).stream()
        .map(BeanDefinition::getBeanClassName)
        .toList();
  }
}
