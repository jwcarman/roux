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
package org.jwcarman.roux.autoconfigure.spa;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.RecordComponent;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.junit.jupiter.api.Test;

import com.jayway.jsonpath.JsonPath;

/** The hand-written metadata describes each of {@code roux.spa}'s properties. */
public class RouxSpaPropertiesMetadataTest {

  @Test
  void metadataDescribesEveryComponentOfTheRecord() throws IOException {
    String json;
    try (InputStream in =
        getClass()
            .getClassLoader()
            .getResourceAsStream("META-INF/spring-configuration-metadata.json")) {
      json = new String(in.readAllBytes(), StandardCharsets.UTF_8);
    }

    List<String> names = JsonPath.read(json, "$.properties[?(@.name =~ /roux\\.spa\\..*/)].name");
    List<String> expected = new ArrayList<>();
    expected.addAll(names(RouxSpaProperties.class, "roux.spa."));
    assertThat(names).containsExactlyInAnyOrderElementsOf(expected);
  }

  /** The kebab-case property names a record binds, nested records flattened. */
  public static List<String> names(Class<? extends Record> type, String prefix) {
    List<String> names = new ArrayList<>();
    for (RecordComponent component : type.getRecordComponents()) {
      String name =
          prefix + component.getName().replaceAll("([A-Z])", "-$1").toLowerCase(Locale.ROOT);
      if (component.getType().isRecord()) {
        names.addAll(names(component.getType().asSubclass(Record.class), name + "."));
      } else {
        names.add(name);
      }
    }
    return names;
  }
}
