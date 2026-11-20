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
package org.jwcarman.roux.validation;

import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.Locale;
import java.util.NavigableSet;
import java.util.TreeSet;
import java.util.regex.Pattern;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import org.hibernate.validator.constraintvalidation.HibernateConstraintValidatorContext;
import org.jspecify.annotations.Nullable;

/** Checks {@link After}: reads the two fields by name and compares them. */
public class AfterValidator implements ConstraintValidator<After, Object> {

  private static final Pattern WORD_BREAK = Pattern.compile("(?<=[a-z0-9])(?=[A-Z])");

  private String field = "";
  private String other = "";
  private String label = "";

  @Override
  public void initialize(After constraint) {
    this.field = constraint.field();
    this.other = constraint.other();
    this.label = constraint.otherLabel().isEmpty() ? words(other) : constraint.otherLabel();
  }

  /** A field name as words: {@code startsAt} is {@code starts at}. */
  static String words(String name) {
    return WORD_BREAK.matcher(name).replaceAll(" ").toLowerCase(Locale.ROOT);
  }

  @Override
  public boolean isValid(@Nullable Object value, ConstraintValidatorContext context) {
    if (value == null) {
      return true;
    }
    Object later = read(value, field);
    Object earlier = read(value, other);
    if (later == null || earlier == null || isAfter(later, earlier, value)) {
      return true;
    }
    context.unwrap(HibernateConstraintValidatorContext.class).addMessageParameter("other", label);
    context.disableDefaultConstraintViolation();
    context
        .buildConstraintViolationWithTemplate(context.getDefaultConstraintMessageTemplate())
        .addPropertyNode(field)
        .addConstraintViolation();
    return false;
  }

  /**
   * Whether {@code later} sorts after {@code earlier}. A sorted set does the comparing by the
   * values' natural order, and refuses (ClassCastException) what has none or what does not mix.
   */
  private boolean isAfter(Object later, Object earlier, Object owner) {
    NavigableSet<Object> sorted = new TreeSet<>();
    try {
      sorted.add(earlier);
      sorted.add(later);
    } catch (ClassCastException e) {
      throw new IllegalStateException(
          "@After on %s: %s (%s) and %s (%s) cannot be compared"
              .formatted(
                  owner.getClass().getName(),
                  field,
                  later.getClass().getSimpleName(),
                  other,
                  earlier.getClass().getSimpleName()),
          e);
    }
    return sorted.last() == later && sorted.size() == 2;
  }

  /**
   * A record component or getter ({@code x()}, {@code getX()}, {@code isX()}), else a field, by
   * name.
   */
  private static @Nullable Object read(Object owner, String name) {
    Class<?> type = owner.getClass();
    String suffix = Character.toUpperCase(name.charAt(0)) + name.substring(1);
    try {
      for (String method : new String[] {name, "get" + suffix, "is" + suffix}) {
        Method accessor = publicMethod(type, method);
        if (accessor != null) {
          accessor.setAccessible(true);
          return accessor.invoke(owner);
        }
      }
      Field field = declaredField(type, name);
      if (field == null) {
        throw new IllegalStateException(
            "@After on %s: no field %s".formatted(type.getName(), name));
      }
      field.setAccessible(true);
      return field.get(owner);
    } catch (IllegalAccessException | InvocationTargetException e) {
      throw new IllegalStateException(
          "@After on %s: cannot read %s".formatted(type.getName(), name), e);
    }
  }

  private static @Nullable Method publicMethod(Class<?> type, String name) {
    try {
      return type.getMethod(name);
    } catch (NoSuchMethodException _) {
      return null;
    }
  }

  private static @Nullable Field declaredField(Class<?> type, String name) {
    for (Class<?> c = type; c != null; c = c.getSuperclass()) {
      try {
        return c.getDeclaredField(name);
      } catch (NoSuchFieldException _) {
        // not declared here: look in the superclass
      }
    }
    return null;
  }
}
