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
package org.jwcarman.roux.validation.sample;

import java.time.LocalTime;

import org.jwcarman.roux.validation.After;

/**
 * Request types in a package of their own, and not public, as an application's are: the validator
 * cannot reach their accessors or fields without making them accessible.
 */
public final class Samples {

  private Samples() {}

  @After(field = "endsAt", other = "startsAt")
  record Meeting(LocalTime startsAt, LocalTime endsAt) {}

  @After(field = "b", other = "a")
  static class Hidden {
    private final Integer a;
    private final Integer b;

    Hidden(Integer a, Integer b) {
      this.a = a;
      this.b = b;
    }
  }

  public static Object meeting(LocalTime startsAt, LocalTime endsAt) {
    return new Meeting(startsAt, endsAt);
  }

  public static Object hidden(int a, int b) {
    return new Hidden(a, b);
  }
}
