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
package org.jwcarman.roux.problems;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.aot.hint.MemberCategory;
import org.springframework.aot.hint.RuntimeHints;
import org.springframework.aot.hint.predicate.RuntimeHintsPredicates;

/** What a native image needs to answer problems the way the JVM does. */
class ProblemsRuntimeHintsTest {

  private final RuntimeHints hints = new RuntimeHints();

  ProblemsRuntimeHintsTest() {
    new ProblemsRuntimeHints().registerHints(hints, getClass().getClassLoader());
  }

  @Test
  void fieldProblemsCanBeSerialized() {
    // serialized from inside ProblemDetail's untyped properties, where AOT cannot see the type
    assertThat(
            RuntimeHintsPredicates.reflection()
                .onType(FieldProblem.class)
                .withMemberCategories(MemberCategory.INVOKE_PUBLIC_METHODS))
        .accepts(hints);
  }

  @Test
  void theContributorValidationMessagesAreIncluded() {
    assertThat(RuntimeHintsPredicates.resource().forBundle("ContributorValidationMessages"))
        .accepts(hints);
  }
}
