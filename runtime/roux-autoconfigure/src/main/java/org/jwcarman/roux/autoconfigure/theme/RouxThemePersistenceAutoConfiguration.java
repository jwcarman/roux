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
package org.jwcarman.roux.autoconfigure.theme;

import jakarta.persistence.EntityManager;

import org.jwcarman.roux.theme.AppTheme;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationPackage;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;

/**
 * Lets Spring Data JPA and Hibernate find roux-theme's entity and repository, by adding its package
 * to the auto-configuration packages, so the app's own entity scan and repository setup are
 * untouched. It runs ahead of the JPA auto-configurations, which read the packages when they start;
 * {@link RouxThemeAutoConfiguration}, which needs the repository, runs after them.
 */
@AutoConfiguration(
    beforeName = {
      "org.springframework.boot.data.jpa.autoconfigure.DataJpaRepositoriesAutoConfiguration",
      "org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration"
    })
@ConditionalOnClass({AppTheme.class, EntityManager.class})
@AutoConfigurationPackage(basePackageClasses = AppTheme.class)
public class RouxThemePersistenceAutoConfiguration {}
