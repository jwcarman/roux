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

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.testcontainers.lifecycle.Startable;

class ContainersTest {

  /** A container that records what is done to it. */
  static final class Recording implements Startable {
    final List<String> calls = new ArrayList<>();

    @Override
    public void start() {
      calls.add("start");
    }

    @Override
    public void stop() {
      calls.add("stop");
    }
  }

  @Test
  void startedStartsTheContainerAndHandsItBack() {
    Recording container = new Recording();

    assertThat(Containers.started(container)).isSameAs(container);
    assertThat(container.calls).containsExactly("start");
  }

  @Test
  void theContainerIsStoppedWhenTheJvmExits() {
    Recording container = new Recording();

    Thread hook = Containers.stopOnExit(container);

    assertThat(Runtime.getRuntime().removeShutdownHook(hook)).isTrue();
    hook.run();
    assertThat(container.calls).containsExactly("stop");
  }
}
