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
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;

/** An app's own entity that shares a user's id and joins the directory, as the A1 list does. */
@Entity
@Table(name = "test_profile")
class TestProfile {

  @Id UUID id;

  String belt;

  @OneToOne
  @JoinColumn(name = "id", insertable = false, updatable = false)
  UserDirectoryEntry user;

  protected TestProfile() {}

  TestProfile(UUID id, String belt) {
    this.id = id;
    this.belt = belt;
  }
}
