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
package org.jwcarman.roux.test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.concurrent.atomic.AtomicReference;

import org.springframework.context.annotation.Primary;

/**
 * The app's clock in an {@link AppTest}: UTC, like who's, and on real time until a test sets it.
 * {@link TestMembers#reset(String...)} puts it back on real time.
 */
@Primary
public class TestClock extends Clock {

  /** Creates a clock on real time. */
  public TestClock() {
    // on real time until set
  }

  private final AtomicReference<Instant> fixed = new AtomicReference<>();

  /**
   * Stops the clock at {@code instant}.
   *
   * @param instant where it stops
   */
  public void set(Instant instant) {
    fixed.set(instant);
  }

  /**
   * Stops the clock at an ISO-8601 instant such as {@code 2026-11-10T17:32:00Z}.
   *
   * @param instant where it stops
   */
  public void set(String instant) {
    set(Instant.parse(instant));
  }

  /**
   * Moves a stopped clock on by {@code duration}; stops a running one there.
   *
   * @param duration how far
   */
  public void advance(Duration duration) {
    fixed.set(instant().plus(duration));
  }

  /** Lets the clock run on real time again. */
  public void useRealTime() {
    fixed.set(null);
  }

  @Override
  public ZoneId getZone() {
    return ZoneOffset.UTC;
  }

  @Override
  public Clock withZone(ZoneId zone) {
    return Clock.fixed(instant(), zone);
  }

  @Override
  public Instant instant() {
    Instant instant = fixed.get();
    return instant == null ? Instant.now() : instant;
  }
}
