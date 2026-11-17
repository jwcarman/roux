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

import java.time.Clock;
import java.time.temporal.TemporalAccessor;
import java.util.Optional;

import org.springframework.data.auditing.DateTimeProvider;

/**
 * A {@link DateTimeProvider} that reads the time from a {@link Clock}, so a test that sets the
 * clock sets {@code @CreatedDate} and {@code @LastModifiedDate} too.
 */
public class ClockDateTimeProvider implements DateTimeProvider {

  private final Clock clock;

  public ClockDateTimeProvider(Clock clock) {
    this.clock = clock;
  }

  @Override
  public Optional<TemporalAccessor> getNow() {
    return Optional.of(clock.instant());
  }
}
