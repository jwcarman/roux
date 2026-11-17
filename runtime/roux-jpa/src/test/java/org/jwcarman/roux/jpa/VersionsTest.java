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
package org.jwcarman.roux.jpa;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.jwcarman.jpa.entity.BaseEntity;
import org.jwcarman.roux.problems.InvalidFieldException;
import org.springframework.orm.ObjectOptimisticLockingFailureException;

class VersionsTest {

  /** An entity as read at {@code version} ({@code null} for one never saved). */
  private static final class Rank extends BaseEntity {

    private final Long version;

    Rank(UUID id, Long version) {
      super(id);
      this.version = version;
    }

    @Override
    public Long getVersion() {
      return version;
    }
  }

  private final UUID id = UUID.randomUUID();

  @Test
  void theVersionTheEntityIsAtPasses() {
    assertThatCode(() -> Versions.require(new Rank(id, 3L), 3L)).doesNotThrowAnyException();
  }

  @Test
  void noVersionIsAnErrorOnTheVersionField() {
    assertThatThrownBy(() -> Versions.require(new Rank(id, 3L), null))
        .isInstanceOfSatisfying(
            InvalidFieldException.class,
            e -> {
              assertThat(e.getField()).isEqualTo("version");
              assertThat(e.getMessage()).isEqualTo("Must not be empty");
            });
  }

  @Test
  void anotherVersionIsAnOptimisticLockingFailureNamingTheEntity() {
    assertThatThrownBy(() -> Versions.require(new Rank(id, 4L), 3L))
        .isInstanceOfSatisfying(
            ObjectOptimisticLockingFailureException.class,
            e -> {
              assertThat(e.getPersistentClass()).isEqualTo(Rank.class);
              assertThat(e.getIdentifier()).isEqualTo(id);
            });
  }

  @Test
  void anEntityNeverSavedHasNoVersionToMatch() {
    assertThatThrownBy(() -> Versions.require(new Rank(id, null), 3L))
        .isInstanceOf(ObjectOptimisticLockingFailureException.class);
  }
}
