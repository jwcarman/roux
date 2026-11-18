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
package org.jwcarman.roux.examples.dojo.identity;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * The frontend's list of permissions (frontend/src/permissions.json, which api.ts is tested
 * against) is every permission {@link AppRoles} defines, so the navigation can never name one the
 * server dropped, or miss one it added.
 */
@DisplayNameGeneration(ReplaceUnderscores.class)
class PermissionsFileTest {

  @Test
  void permissions_json_lists_every_permission_AppRoles_defines() {
    List<String> listed =
        JsonMapper.builder()
            .build()
            .readValue(Path.of("frontend/src/permissions.json").toFile(), new TypeReference<>() {});

    assertThat(listed).containsExactlyInAnyOrderElementsOf(defined());
  }

  @Test
  void every_role_grants_only_defined_permissions() {
    for (AppRoles.AppRole role : AppRoles.AppRole.values()) {
      assertThat(defined()).containsAll(role.permissions());
    }
  }

  private static List<String> defined() {
    return Arrays.stream(AppRoles.class.getFields())
        .filter(f -> Modifier.isStatic(f.getModifiers()) && f.getType() == String.class)
        .map(PermissionsFileTest::value)
        .toList();
  }

  private static String value(Field field) {
    try {
      return (String) field.get(null);
    } catch (IllegalAccessException e) {
      throw new IllegalStateException(e);
    }
  }
}
