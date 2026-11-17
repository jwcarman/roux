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
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

import org.junit.jupiter.api.Test;

import com.jayway.jsonpath.JsonPath;

/** The hand-written metadata describes each of {@code roux.spa}'s properties. */
class RouxSpaPropertiesMetadataTest {

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
    List<String> expected =
        Arrays.stream(RouxSpaProperties.class.getRecordComponents())
            .map(RecordComponent::getName)
            .map(name -> "roux.spa." + name.replaceAll("([A-Z])", "-$1").toLowerCase(Locale.ROOT))
            .toList();
    assertThat(names).containsExactlyInAnyOrderElementsOf(expected);
  }
}
