package org.jwcarman.roux.examples.dojo.theme;

import org.jspecify.annotations.Nullable;
import org.springframework.aot.hint.RuntimeHints;
import org.springframework.aot.hint.RuntimeHintsRegistrar;

/**
 * What a native image needs for the app's name: {@code application.yml} imports
 * app-name.properties, written when the app is created, and Spring Boot only includes its own
 * {@code application*} files by itself.
 */
class AppNameRuntimeHints implements RuntimeHintsRegistrar {

  @Override
  public void registerHints(RuntimeHints hints, @Nullable ClassLoader classLoader) {
    hints.resources().registerPattern("app-name.properties");
  }
}
