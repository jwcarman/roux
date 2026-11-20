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

import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Who the actors are: an app's bean that names who identities, a page at a time. Without one, every
 * actor is {@link Activity#UNKNOWN}.
 */
@FunctionalInterface
public interface ActorNames {

  /**
   * The display names of {@code identityIds}; an id left out of the answer is {@link
   * Activity#UNKNOWN}.
   */
  Map<UUID, String> namesOf(Set<UUID> identityIds);
}
