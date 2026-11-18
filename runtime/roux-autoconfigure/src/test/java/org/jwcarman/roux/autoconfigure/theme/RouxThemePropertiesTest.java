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
package org.jwcarman.roux.autoconfigure.theme;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.jwcarman.roux.autoconfigure.spa.RouxSpaPropertiesMetadataTest;
import org.jwcarman.roux.spa.ShellTheme;

import com.jayway.jsonpath.JsonPath;

class RouxThemePropertiesTest {

  private static final RouxThemeProperties STOCK =
      new RouxThemeProperties(null, "gray", "#3b82f6", "medium", "standard", "standard");

  @Test
  void the_application_name_stands_for_a_missing_app_name() {
    assertThat(STOCK.theme("dojo")).isEqualTo(ShellTheme.stock("dojo"));
  }

  @Test
  void the_app_name_beats_the_application_name() {
    RouxThemeProperties named =
        new RouxThemeProperties("Dojo", "teal", "#ff8800", "round", "classic", "modern");

    assertThat(named.theme("dojo"))
        .isEqualTo(new ShellTheme("Dojo", "teal", "#ff8800", "round", "classic", "modern"));
  }

  @Test
  void no_name_at_all_is_an_error_that_says_what_to_set() {
    assertThatThrownBy(() -> STOCK.theme(null))
        .isInstanceOf(IllegalStateException.class)
        .hasMessage("The app has no name: set roux.theme.app-name or spring.application.name");
  }

  @Test
  void the_metadata_describes_every_property() throws IOException {
    String json;
    try (InputStream in =
        getClass()
            .getClassLoader()
            .getResourceAsStream("META-INF/spring-configuration-metadata.json")) {
      json = new String(in.readAllBytes(), StandardCharsets.UTF_8);
    }

    List<String> names = JsonPath.read(json, "$.properties[?(@.name =~ /roux\\.theme\\..*/)].name");

    assertThat(names)
        .containsExactlyInAnyOrderElementsOf(
            RouxSpaPropertiesMetadataTest.names(RouxThemeProperties.class, "roux.theme."));
  }
}
