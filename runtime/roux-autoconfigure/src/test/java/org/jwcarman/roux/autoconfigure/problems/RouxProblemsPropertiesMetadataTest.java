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
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.jayway.jsonpath.JsonPath;

/** The configuration processor describes roux's properties, so an IDE can complete them. */
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
}
