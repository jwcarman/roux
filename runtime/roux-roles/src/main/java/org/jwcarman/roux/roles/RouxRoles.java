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
package org.jwcarman.roux.roles;

/**
 * The roles roux itself defines. roux-roles' changelog creates them; an app's own roles live in its
 * own changelog.
 */
public final class RouxRoles {

  /**
   * Holds every permission there is. roux makes the first holder from {@code roux.owner.*}, and
   * only owners may manage people, so the last active one cannot be removed.
   */
  public static final String OWNER = "OWNER";

  private RouxRoles() {}
}
