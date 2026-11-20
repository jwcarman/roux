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

import org.testcontainers.lifecycle.Startable;

/**
 * The kit's containers run for the whole test run, one per JVM, and stop when it exits: Ryuk stops
 * them too, but not where it is disabled ({@code TESTCONTAINERS_RYUK_DISABLED}).
 */
final class Containers {

  private Containers() {}

  /** Starts {@code container}, to be stopped when the JVM exits. */
  static <T extends Startable> T started(T container) {
    container.start();
    stopOnExit(container);
    return container;
  }

  /** Stops {@code container} when the JVM exits; answers the shutdown hook that will. */
  static Thread stopOnExit(Startable container) {
    Thread hook = new Thread(container::stop, "roux-test container stop");
    Runtime.getRuntime().addShutdownHook(hook);
    return hook;
  }
}
