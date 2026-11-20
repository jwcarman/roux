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

import java.time.Instant;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import org.hibernate.annotations.Immutable;
import org.jwcarman.jpa.entity.BaseEntity;

/**
 * One user as the directory shows them: read-only, from the view {@code roux_user_directory} over
 * {@link AppUser} and who's tables. Nothing here is stored by roux but the name: the email, role,
 * status and joined date are read from who each time.
 */
@Entity
@Immutable
@Table(name = "roux_user_directory")
public class UserDirectoryEntry extends BaseEntity {

  private String displayName;
  private String email;
  private String role;
  private String status;
  private Instant joinedAt;
  private boolean invited;

  /** For JPA. */
  protected UserDirectoryEntry() {}

  /**
   * The name the app shows.
   *
   * @return the display name
   */
  public String getDisplayName() {
    return displayName;
  }

  /**
   * The user's oldest sign-in address (who's {@code EmailCredentialService.findOldestFor}).
   *
   * @return the address, or null when they have none
   */
  public String getEmail() {
    return email;
  }

  /**
   * The user's role, by name. roux keeps one per user; should who's own admin have given more, this
   * is the first by name.
   *
   * @return the role's name, or null when they have none
   */
  public String getRole() {
    return role;
  }

  /**
   * A {@link UserStatus} name: {@code DEACTIVATED} whenever who will not let them sign in.
   *
   * @return the status
   */
  public String getStatus() {
    return status;
  }

  /**
   * When the user's identity was made: invited, or made as the first owner.
   *
   * @return the moment they joined
   */
  public Instant getJoinedAt() {
    return joinedAt;
  }

  /**
   * Whether the user has never signed in: who holds no session for them, current or ended. who
   * deletes ended sessions after a while, so someone who signed in long ago can be invited again.
   *
   * @return true while their invitation is unaccepted
   */
  public boolean isInvited() {
    return invited;
  }
}
