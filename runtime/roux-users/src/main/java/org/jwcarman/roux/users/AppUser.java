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

import java.util.UUID;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import org.jwcarman.jpa.spring.audit.AuditableEntity;

/**
 * Someone who can sign in to the app: who's identity, with the name the app shows for them. Its id
 * is the identity's id. Thin on purpose: who owns status, sign-in addresses, passkeys and roles,
 * which roux reads from who and never copies here, and an app's own data about a person (a phone
 * number, a department) belongs on the app's own entity, which shares this id
 * ({@code @OneToOne @MapsId AppUser user}) or links to it.
 *
 * <p>roux makes one for every user who joins ({@link AppUsers}); an app does not create them.
 */
@Entity
@Table(name = "roux_user")
public class AppUser extends AuditableEntity {

  /** The longest display name, after trimming. */
  public static final int MAX_NAME = 80;

  private String displayName;

  /** For JPA. */
  protected AppUser() {}

  /**
   * A user for who's identity {@code id}.
   *
   * @param id the identity's id
   * @param displayName their name, trimmed; not blank, at most {@value #MAX_NAME} characters
   * @throws IllegalArgumentException if the name is blank or too long
   */
  public AppUser(UUID id, String displayName) {
    super(id);
    rename(displayName);
  }

  /**
   * The name the app shows for this user.
   *
   * @return the display name
   */
  public String getDisplayName() {
    return displayName;
  }

  /**
   * Changes the name the app shows.
   *
   * @param displayName the new name, trimmed; not blank, at most {@value #MAX_NAME} characters
   * @throws IllegalArgumentException if the name is null, blank or too long
   */
  public void rename(String displayName) {
    String trimmed = displayName == null ? "" : displayName.strip();
    if (trimmed.isEmpty()) {
      throw new IllegalArgumentException("A user's name must not be blank");
    }
    if (trimmed.length() > MAX_NAME) {
      throw new IllegalArgumentException(
          "A user's name must be at most " + MAX_NAME + " characters");
    }
    this.displayName = trimmed;
  }
}
