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

import java.time.Clock;
import java.util.Map;

import jakarta.persistence.EntityManager;

import org.jwcarman.roux.activity.ActivityLog;
import org.jwcarman.roux.activity.ActivityRepository;
import org.jwcarman.roux.activity.ActorNames;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;

import tools.jackson.databind.json.JsonMapper;

/**
 * roux's {@link ActivityLog}, over its table: the app's {@link JsonMapper} writes each activity's
 * details, its {@link Clock} says when, and its {@link ActorNames} (when it declares one) names
 * who. An app that declares its own {@link ActivityLog} replaces roux's.
 */
@AutoConfiguration(
    afterName = {
      "org.springframework.boot.data.jpa.autoconfigure.DataJpaRepositoriesAutoConfiguration",
      "org.springframework.boot.jackson.autoconfigure.JacksonAutoConfiguration"
    })
@ConditionalOnClass({ActivityLog.class, EntityManager.class})
@ConditionalOnBean(ActivityRepository.class)
public class RouxActivityLogAutoConfiguration {

  @Bean
  @ConditionalOnMissingBean
  ActivityLog activityLog(
      ActivityRepository entries,
      ObjectProvider<JsonMapper> json,
      ObjectProvider<Clock> clock,
      ObjectProvider<ActorNames> names) {
    return new ActivityLog(
        entries,
        json.getIfAvailable(() -> JsonMapper.builder().build()),
        clock.getIfAvailable(Clock::systemUTC),
        names.getIfAvailable(() -> ids -> Map.of()));
  }
}
