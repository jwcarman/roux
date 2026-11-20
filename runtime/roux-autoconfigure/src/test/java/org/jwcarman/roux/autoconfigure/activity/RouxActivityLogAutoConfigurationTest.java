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
package org.jwcarman.roux.autoconfigure.activity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import jakarta.persistence.EntityManager;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.jwcarman.jpa.pagination.PageSpec;
import org.jwcarman.jpa.pagination.SortDirection;
import org.jwcarman.roux.activity.Activity;
import org.jwcarman.roux.activity.ActivityEntry;
import org.jwcarman.roux.activity.ActivityLog;
import org.jwcarman.roux.activity.ActivityRepository;
import org.jwcarman.roux.activity.ActorNames;
import org.jwcarman.roux.activity.BusinessActivity;
import org.mockito.ArgumentCaptor;
import org.springframework.boot.autoconfigure.AutoConfigurationPackages;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.FilteredClassLoader;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import tools.jackson.databind.json.JsonMapper;

@DisplayNameGeneration(ReplaceUnderscores.class)
class RouxActivityLogAutoConfigurationTest {

  record Renamed(String from, String to) implements BusinessActivity {
    @Override
    public String type() {
      return "member.renamed";
    }

    @Override
    public String describe() {
      return "Renamed";
    }
  }

  record FirstPage() implements PageSpec {
    @Override
    public Integer pageIndex() {
      return 0;
    }

    @Override
    public Integer pageSize() {
      return 20;
    }

    @Override
    public String sortBy() {
      return null;
    }

    @Override
    public SortDirection sortDirection() {
      return null;
    }
  }

  private static final Instant NOW = Instant.parse("2026-11-20T15:00:00Z");
  private static final UUID ANN = UUID.randomUUID();

  private final ActivityRepository entries = mock(ActivityRepository.class);

  private final ApplicationContextRunner runner =
      new ApplicationContextRunner()
          .withConfiguration(AutoConfigurations.of(RouxActivityLogAutoConfiguration.class))
          .withBean(ActivityRepository.class, () -> entries);

  private ActivityEntry savedBy(ActivityLog log) {
    log.append(UUID.randomUUID(), new Renamed("a", "b"));
    ArgumentCaptor<ActivityEntry> entry = ArgumentCaptor.forClass(ActivityEntry.class);
    verify(entries).save(entry.capture());
    return entry.getValue();
  }

  private String nameOfAnn(ActivityLog log) {
    ActivityEntry row = mock(ActivityEntry.class);
    when(row.getActorId()).thenReturn(ANN);
    when(row.getDetails()).thenReturn("{}");
    when(entries.history(any(), any()))
        .thenReturn(new PageImpl<>(List.of(row), PageRequest.of(0, 20), 1));
    return log.history(UUID.randomUUID(), new FirstPage()).data().getFirst().actorName();
  }

  @Test
  void the_log_is_there_with_a_jpa_app() {
    runner.run(context -> assertThat(context).hasSingleBean(ActivityLog.class));
  }

  @Test
  void it_writes_with_the_apps_clock_and_json_mapper() {
    JsonMapper json = mock(JsonMapper.class);
    when(json.writeValueAsString(any())).thenReturn("{\"mine\":true}");
    runner
        .withBean(Clock.class, () -> Clock.fixed(NOW, ZoneOffset.UTC))
        .withBean(JsonMapper.class, () -> json)
        .run(
            context -> {
              ActivityEntry entry = savedBy(context.getBean(ActivityLog.class));
              assertThat(entry.getOccurredAt()).isEqualTo(NOW);
              assertThat(entry.getDetails()).isEqualTo("{\"mine\":true}");
            });
  }

  @Test
  void without_the_apps_clock_or_mapper_it_uses_the_system_clock_and_plain_json() {
    runner.run(
        context -> {
          Instant before = Instant.now();
          ActivityEntry entry = savedBy(context.getBean(ActivityLog.class));
          assertThat(entry.getOccurredAt()).isAfterOrEqualTo(before);
          assertThat(entry.getDetails()).isEqualTo("{\"from\":\"a\",\"to\":\"b\"}");
        });
  }

  @Test
  void an_apps_actor_names_are_used() {
    runner
        .withBean(ActorNames.class, () -> ids -> Map.of(ANN, "Ann"))
        .run(context -> assertThat(nameOfAnn(context.getBean(ActivityLog.class))).isEqualTo("Ann"));
  }

  @Test
  void without_actor_names_every_actor_is_unknown() {
    runner.run(
        context ->
            assertThat(nameOfAnn(context.getBean(ActivityLog.class))).isEqualTo(Activity.UNKNOWN));
  }

  @Test
  void an_apps_own_log_replaces_rouxs() {
    ActivityLog mine = mock(ActivityLog.class);
    runner
        .withBean(ActivityLog.class, () -> mine)
        .run(context -> assertThat(context.getBean(ActivityLog.class)).isSameAs(mine));
  }

  @Test
  void without_a_repository_there_is_no_log() {
    new ApplicationContextRunner()
        .withConfiguration(AutoConfigurations.of(RouxActivityLogAutoConfiguration.class))
        .run(context -> assertThat(context).doesNotHaveBean(ActivityLog.class));
  }

  @Test
  void without_jpa_there_is_no_log() {
    runner
        .withClassLoader(new FilteredClassLoader(EntityManager.class))
        .run(context -> assertThat(context).doesNotHaveBean(ActivityLog.class));
  }

  @Test
  void the_entity_and_its_repository_are_in_the_apps_jpa_packages() {
    new ApplicationContextRunner()
        .withConfiguration(AutoConfigurations.of(RouxActivityLogPersistenceAutoConfiguration.class))
        .run(
            context ->
                assertThat(AutoConfigurationPackages.get(context))
                    .contains(ActivityLog.class.getPackageName()));
  }
}
