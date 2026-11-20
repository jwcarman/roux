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

import java.time.Instant;
import java.util.UUID;

import org.jspecify.annotations.Nullable;

import tools.jackson.databind.JsonNode;

/**
 * One activity in a record's history, as the browser gets it.
 *
 * @param id the activity's id
 * @param occurredAt when it happened
 * @param type its kind's code ({@link BusinessActivity#type()})
 * @param description what happened, as written then ({@link BusinessActivity#describe()})
 * @param actorId who did it; {@code null} for the system
 * @param actorName their name from {@link ActorNames}, {@link #UNKNOWN} when it has none, or {@link
 *     #SYSTEM}
 * @param details the activity's components, as the JSON object they were written as
 */
public record Activity(
    UUID id,
    Instant occurredAt,
    String type,
    String description,
    @Nullable UUID actorId,
    String actorName,
    JsonNode details) {

  /** The actor's name for what the system did, with no one signed in. */
  public static final String SYSTEM = "System";

  /** The actor's name when {@link ActorNames} does not name them. */
  public static final String UNKNOWN = "Unknown";
}
