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
package org.jwcarman.roux.roles;

import java.lang.reflect.Field;
import java.lang.reflect.Modifier;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.SequencedMap;
import java.util.Set;

/**
 * Permissions as an app declares them: {@code public static final String} constants, a utility
 * class per module ({@code WhoAdminPermissions}, {@code RouxThemePermissions}, the app's own).
 * Nothing registers them; the app's roles test lists the classes.
 */
public final class Permissions {

  private Permissions() {}

  /**
   * Every permission the classes declare, in declaration order, without duplicates. Only {@code
   * public static final String} fields count; private constants are helpers.
   *
   * @param types the classes declaring permissions
   * @return the permissions' values
   * @throws IllegalArgumentException when no class is given, or a class declares none: an empty
   *     list would pass every check, and a native image missing a reflection hint would produce one
   */
  public static List<String> allOf(Class<?>... types) {
    Set<String> permissions = new LinkedHashSet<>();
    constantsOf(types).values().forEach(named -> permissions.addAll(named.values()));
    return List.copyOf(permissions);
  }

  /**
   * Each class's permission constants, by field name, in declaration order: what {@link #allOf}
   * lists, keeping the names.
   *
   * @param types the classes declaring permissions
   * @return for each class, in the order given, its constants' values by field name
   * @throws IllegalArgumentException when no class is given, or a class declares none
   */
  public static SequencedMap<Class<?>, SequencedMap<String, String>> constantsOf(
      Class<?>... types) {
    if (types.length == 0) {
      throw new IllegalArgumentException("Name at least one class of permission constants");
    }
    SequencedMap<Class<?>, SequencedMap<String, String>> constants = new LinkedHashMap<>();
    for (Class<?> type : types) {
      SequencedMap<String, String> named = new LinkedHashMap<>();
      for (Field field : type.getDeclaredFields()) {
        if (isConstant(field)) {
          named.put(field.getName(), valueOf(field));
        }
      }
      if (named.isEmpty()) {
        throw new IllegalArgumentException(
            type.getName() + " declares no public static final String permission constants");
      }
      constants.put(type, named);
    }
    return constants;
  }

  private static boolean isConstant(Field field) {
    int modifiers = field.getModifiers();
    return Modifier.isPublic(modifiers)
        && Modifier.isStatic(modifiers)
        && Modifier.isFinal(modifiers)
        && field.getType() == String.class;
  }

  private static String valueOf(Field field) {
    try {
      return (String) field.get(null);
    } catch (IllegalAccessException e) {
      throw new IllegalArgumentException("Cannot read " + field, e);
    }
  }
}
