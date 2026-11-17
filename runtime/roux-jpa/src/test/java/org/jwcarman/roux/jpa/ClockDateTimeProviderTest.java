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

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;

class ClockDateTimeProviderTest {

  private static final Instant NOW = Instant.parse("2026-03-04T05:06:07Z");

  @Test
  void nowIsTheClocksInstant() {
    var provider = new ClockDateTimeProvider(Clock.fixed(NOW, ZoneOffset.UTC));

    assertThat(provider.getNow()).contains(NOW);
  }

  @Test
  void itFollowsTheClockAsItMoves() {
    var clock = new java.util.concurrent.atomic.AtomicReference<>(NOW);
    Clock moving =
        new Clock() {
          @Override
          public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
          }

          @Override
          public Clock withZone(java.time.ZoneId zone) {
            return this;
          }

          @Override
          public Instant instant() {
            return clock.get();
          }
        };
    var provider = new ClockDateTimeProvider(moving);

    clock.set(NOW.plusSeconds(60));

    assertThat(provider.getNow()).contains(NOW.plusSeconds(60));
  }
}
