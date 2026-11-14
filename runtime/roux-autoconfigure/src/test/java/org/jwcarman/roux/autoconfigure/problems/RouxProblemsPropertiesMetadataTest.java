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
package org.jwcarman.roux.autoconfigure.problems;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.RecordComponent;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.DefaultValue;

import com.jayway.jsonpath.JsonPath;

/** The hand-written metadata describes roux's properties, so an IDE can complete them. */
class RouxProblemsPropertiesMetadataTest {

  @Test
  void metadataDescribesProperties() throws IOException {
    List<String> names = new ArrayList<>();
    for (URL metadata :
        Collections.list(
            getClass()
                .getClassLoader()
                .getResources("META-INF/spring-configuration-metadata.json"))) {
      try (InputStream in = metadata.openStream()) {
        List<String> described =
            JsonPath.read(
                new String(in.readAllBytes(), StandardCharsets.UTF_8), "$.properties[*].name");
        names.addAll(described);
      }
    }
    assertThat(names).contains("roux.problems.enabled", "roux.problems.api-path-prefix");
  }

  @Test
  void metadataMatchesTheRecord() throws IOException {
    String json;
    try (InputStream in =
        getClass()
            .getClassLoader()
            .getResourceAsStream("META-INF/spring-configuration-metadata.json")) {
      json = new String(in.readAllBytes(), StandardCharsets.UTF_8);
    }

    Map<String, List<String>> expected = new TreeMap<>();
    RecordComponent[] components = RouxProblemsProperties.class.getRecordComponents();
    Constructor<?> canonical = RouxProblemsProperties.class.getDeclaredConstructors()[0];
    for (int i = 0; i < components.length; i++) {
      Class<?> type = components[i].getType();
      String javaType = type == boolean.class ? Boolean.class.getName() : type.getName();
      String defaultValue =
          canonical.getParameters()[i].getAnnotation(DefaultValue.class).value()[0];
      expected.put(
          "roux.problems." + kebabCase(components[i].getName()), List.of(javaType, defaultValue));
    }

    List<String> names = JsonPath.read(json, "$.properties[*].name");
    assertThat(names).containsExactlyInAnyOrderElementsOf(expected.keySet());
    expected.forEach(
        (name, typeAndDefault) -> {
          String filter = "$.properties[?(@.name == '" + name + "')]";
          List<String> types = JsonPath.read(json, filter + ".type");
          List<Object> defaults = JsonPath.read(json, filter + ".defaultValue");
          assertThat(types).containsExactly(typeAndDefault.get(0));
          assertThat(defaults).extracting(String::valueOf).containsExactly(typeAndDefault.get(1));
        });
  }

  private static String kebabCase(String camelCase) {
    return camelCase.replaceAll("([A-Z])", "-$1").toLowerCase(Locale.ROOT);
  }
}
