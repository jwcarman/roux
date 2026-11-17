package org.jwcarman.roux.examples.dojo;

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

  private final AtomicReference<Instant> fixed = new AtomicReference<>();

  /** Stops the clock at {@code instant}. */
  public void set(Instant instant) {
    fixed.set(instant);
  }

  /** Stops the clock at an ISO-8601 instant such as {@code 2026-11-10T17:32:00Z}. */
  public void set(String instant) {
    set(Instant.parse(instant));
  }

  /** Moves a stopped clock on by {@code duration}; stops a running one there. */
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
