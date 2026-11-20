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
package org.jwcarman.roux.autoconfigure.users;

import jakarta.persistence.EntityManager;

import org.jwcarman.roux.users.AppUserRepository;
import org.jwcarman.roux.users.AppUsers;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;

/**
 * The app's users: an {@code AppUser} for everyone who joins ({@link AppUsers}). Runs after Spring
 * Data JPA has made roux-users' repositories, and only with them.
 */
@AutoConfiguration(
    afterName =
        "org.springframework.boot.data.jpa.autoconfigure.DataJpaRepositoriesAutoConfiguration")
@ConditionalOnClass({AppUsers.class, EntityManager.class})
@ConditionalOnBean(AppUserRepository.class)
public class RouxUsersAutoConfiguration {

  @Bean
  AppUsers rouxAppUsers(AppUserRepository users) {
    return new AppUsers(users);
  }
}
