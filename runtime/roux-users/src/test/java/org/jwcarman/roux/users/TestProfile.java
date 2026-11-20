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
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.MapsId;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;

/** An app's entity for a user, mapped as the users guide's {@code Coach} is. */
@Entity
@Table(name = "test_profile")
class TestProfile {

  @Id UUID id;

  @MapsId
  @OneToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "id")
  AppUser user;

  @OneToOne(fetch = FetchType.LAZY)
  @JoinColumn(name = "id", insertable = false, updatable = false)
  UserDirectoryEntry entry;

  String belt;

  protected TestProfile() {}

  TestProfile(AppUser user, String belt) {
    this.user = user;
    this.belt = belt;
  }
}
