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
package org.jwcarman.roux.users;

/**
 * The permissions roux's users endpoints check. roux-users' changelog grants all four to {@code
 * OWNER}; an app grants them to its own roles in its changelog.
 */
public final class RouxUserPermissions {

  /** List users and read one, with their history. */
  public static final String USERS_READ = "users.read";

  /** Invite someone, or send their invitation again. */
  public static final String USERS_INVITE = "users.invite";

  /** Rename someone, change their role, deactivate or reactivate them, sign them out everywhere. */
  public static final String USERS_MANAGE = "users.manage";

  /**
   * Make an existing user an owner (with a recent sign-in). Leave it to {@code OWNER}: whoever
   * holds it can hand out everything.
   */
  public static final String USERS_OWNERS = "users.owners";

  private RouxUserPermissions() {}
}
