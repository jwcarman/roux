package org.jwcarman.roux.examples.dojo.theme;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.aot.hint.RuntimeHints;
import org.springframework.aot.hint.predicate.RuntimeHintsPredicates;

/** A native image starts only if it holds the app-name file that application.yml imports. */
class AppNameRuntimeHintsTest {

  @Test
  void theAppNameFileIsIncluded() {
    var hints = new RuntimeHints();
    new AppNameRuntimeHints().registerHints(hints, getClass().getClassLoader());

    assertThat(RuntimeHintsPredicates.resource().forResource("app-name.properties")).accepts(hints);
  }
}
