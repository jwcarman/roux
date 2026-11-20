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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import java.util.Map;

import jakarta.persistence.EntityManager;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.activity.ActorNames;
import org.jwcarman.roux.autoconfigure.activity.RouxActivityLogAutoConfiguration;
import org.jwcarman.roux.users.AppUserActorNames;
import org.jwcarman.roux.users.AppUserRepository;
import org.jwcarman.roux.users.AppUsers;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurationPackages;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.FilteredClassLoader;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

@DisplayNameGeneration(ReplaceUnderscores.class)
class RouxUsersAutoConfigurationTest {

  private final ApplicationContextRunner runner =
      new ApplicationContextRunner()
          .withConfiguration(AutoConfigurations.of(RouxUsersAutoConfiguration.class))
          .withBean(AppUserRepository.class, () -> mock(AppUserRepository.class));

  @Test
  void users_who_join_get_an_app_user() {
    runner.run(context -> assertThat(context).hasSingleBean(AppUsers.class));
  }

  @Test
  void the_activity_logs_actors_are_named_after_the_users() {
    runner.run(
        context ->
            assertThat(context.getBean(ActorNames.class)).isInstanceOf(AppUserActorNames.class));
  }

  @Test
  void an_apps_own_actor_names_replace_rouxs() {
    ActorNames mine = ids -> Map.of();
    runner
        .withBean(ActorNames.class, () -> mine)
        .run(context -> assertThat(context.getBean(ActorNames.class)).isSameAs(mine));
  }

  @Test
  void the_activity_log_names_actors_with_them() {
    assertThat(RouxUsersAutoConfiguration.class.getAnnotation(AutoConfiguration.class).before())
        .contains(RouxActivityLogAutoConfiguration.class);
  }

  @Test
  void without_the_repository_there_is_nothing() {
    new ApplicationContextRunner()
        .withConfiguration(AutoConfigurations.of(RouxUsersAutoConfiguration.class))
        .run(context -> assertThat(context).doesNotHaveBean(AppUsers.class));
  }

  @Test
  void without_jpa_there_is_nothing() {
    runner
        .withClassLoader(new FilteredClassLoader(EntityManager.class))
        .run(context -> assertThat(context).doesNotHaveBean(AppUsers.class));
  }

  @Test
  void the_entity_and_its_repository_are_in_the_apps_jpa_packages() {
    new ApplicationContextRunner()
        .withConfiguration(AutoConfigurations.of(RouxUsersPersistenceAutoConfiguration.class))
        .run(
            context ->
                assertThat(AutoConfigurationPackages.get(context))
                    .contains(AppUsers.class.getPackageName()));
  }
}
