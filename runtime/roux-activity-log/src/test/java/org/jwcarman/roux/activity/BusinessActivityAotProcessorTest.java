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
package org.jwcarman.roux.activity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.aot.generate.GenerationContext;
import org.springframework.aot.hint.RuntimeHints;
import org.springframework.aot.hint.predicate.RuntimeHintsPredicates;
import org.springframework.beans.factory.aot.BeanFactoryInitializationCode;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import org.springframework.boot.autoconfigure.AutoConfigurationPackages;

import com.example.activities.NotARecord;
import com.example.activities.SampleActivity;

/**
 * A native image writes an activity's components as JSON by reflection, so every activity record
 * (the app's and roux's own) is registered ahead of time, with nothing for the app to declare.
 */
class BusinessActivityAotProcessorTest {

  /** The hints the processor contributes for a bean factory with the app's {@code packages}. */
  private static RuntimeHints hintsFor(String... packages) {
    DefaultListableBeanFactory beanFactory = new DefaultListableBeanFactory();
    if (packages.length > 0) {
      AutoConfigurationPackages.register(beanFactory, packages);
    }
    RuntimeHints hints = new RuntimeHints();
    GenerationContext context = mock(GenerationContext.class);
    when(context.getRuntimeHints()).thenReturn(hints);
    new BusinessActivityAotProcessor()
        .processAheadOfTime(beanFactory)
        .applyTo(context, mock(BeanFactoryInitializationCode.class));
    return hints;
  }

  @Test
  void registersTheAppsActivityRecordsForJson() {
    RuntimeHints hints = hintsFor("com.example.activities");

    assertThat(RuntimeHintsPredicates.reflection().onMethodInvocation(SampleActivity.class, "name"))
        .accepts(hints);
  }

  @Test
  void registersRouxsOwnActivityRecordsWithoutAnyAppPackage() {
    RuntimeHints hints = hintsFor();

    assertThat(
            RuntimeHintsPredicates.reflection()
                .onMethodInvocation(RouxSampleActivity.class, "from"))
        .accepts(hints);
    assertThat(RuntimeHintsPredicates.reflection().onType(SampleActivity.class)).rejects(hints);
  }

  @Test
  void registersNothingForAnActivityThatIsNotARecord() {
    RuntimeHints hints = hintsFor("com.example.activities");

    assertThat(RuntimeHintsPredicates.reflection().onType(NotARecord.class)).rejects(hints);
    assertThat(RuntimeHintsPredicates.reflection().onType(BusinessActivity.class)).rejects(hints);
  }
}
