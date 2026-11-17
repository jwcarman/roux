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
package org.jwcarman.roux.problems;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.ElementKind;
import jakarta.validation.Path;

import org.springframework.beans.TypeMismatchException;
import org.springframework.context.MessageSourceResolvable;
import org.springframework.validation.BindingResult;
import org.springframework.validation.FieldError;
import org.springframework.validation.method.ParameterErrors;
import org.springframework.validation.method.ParameterValidationResult;

import tools.jackson.core.JacksonException;

/**
 * Turns every kind of validation result into a 400's {@code errors}, sorted by field then message.
 */
final class FieldErrors {

  private static final Comparator<FieldProblem> ORDER =
      Comparator.comparing(FieldProblem::field).thenComparing(FieldProblem::message);

  private FieldErrors() {}

  /** A request body's field errors. */
  static List<FieldProblem> of(BindingResult result) {
    return sorted(result.getFieldErrors().stream().map(FieldErrors::problem).toList());
  }

  /** A controller method's parameter validation results. */
  static List<FieldProblem> of(Collection<ParameterValidationResult> results) {
    List<FieldProblem> problems = new ArrayList<>();
    for (ParameterValidationResult result : results) {
      if (result instanceof ParameterErrors errors) {
        errors.getFieldErrors().forEach(e -> problems.add(problem(e)));
      } else {
        String name = result.getMethodParameter().getParameterName();
        for (MessageSourceResolvable error : result.getResolvableErrors()) {
          problems.add(new FieldProblem(name == null ? "" : name, message(error)));
        }
      }
    }
    return sorted(problems);
  }

  /**
   * Bean Validation's violations. A method's violation drops the method; it drops the parameter too
   * when the violation is on one of the parameter's own fields, which are what the client sent.
   */
  static List<FieldProblem> of(Set<? extends ConstraintViolation<?>> violations) {
    return sorted(
        violations.stream()
            .map(v -> new FieldProblem(path(v.getPropertyPath()), v.getMessage()))
            .toList());
  }

  /** The field a Jackson read failure names: {@code members[1].role}. */
  static String path(List<JacksonException.Reference> references) {
    StringBuilder field = new StringBuilder();
    for (JacksonException.Reference reference : references) {
      if (reference.getPropertyName() != null) {
        field.append(field.isEmpty() ? "" : ".").append(reference.getPropertyName());
      } else {
        field.append('[').append(reference.getIndex()).append(']');
      }
    }
    return field.toString();
  }

  private static String path(Path path) {
    List<Path.Node> nodes = new ArrayList<>();
    path.forEach(nodes::add);
    StringBuilder field = new StringBuilder();
    for (Path.Node node : nodes.subList(firstFieldNode(nodes), nodes.size())) {
      appendNode(field, node);
    }
    return field.toString();
  }

  /**
   * Where the field path starts: past the method or constructor node, and past the parameter node
   * when the violation is on one of that parameter's own fields.
   */
  private static int firstFieldNode(List<Path.Node> nodes) {
    if (nodes.isEmpty() || !isExecutable(nodes.getFirst())) {
      return 0;
    }
    return nodes.size() > 2 && nodes.get(1).getKind() == ElementKind.PARAMETER ? 2 : 1;
  }

  private static void appendNode(StringBuilder field, Path.Node node) {
    if (node.isInIterable()) {
      Object at = node.getIndex() != null ? node.getIndex() : node.getKey();
      if (at != null) {
        field.append('[').append(at).append(']');
      }
    }
    if (node.getKind() != ElementKind.CONTAINER_ELEMENT && node.getName() != null) {
      field.append(field.isEmpty() ? "" : ".").append(node.getName());
    }
  }

  private static boolean isExecutable(Path.Node node) {
    return node.getKind() == ElementKind.METHOD || node.getKind() == ElementKind.CONSTRUCTOR;
  }

  private static FieldProblem problem(FieldError error) {
    if (error.isBindingFailure()) {
      // Spring's conversion message names Java types and echoes the input: never show it
      Class<?> type =
          error.contains(TypeMismatchException.class)
              ? error.unwrap(TypeMismatchException.class).getRequiredType()
              : null;
      return new FieldProblem(error.getField(), typeMessage(type));
    }
    return new FieldProblem(error.getField(), message(error));
  }

  /** What a value of the wrong type is told: the choices for an enum, otherwise just invalid. */
  static String typeMessage(Class<?> type) {
    if (type != null && type.isEnum()) {
      return "Must be one of "
          + Arrays.stream(type.getEnumConstants())
              .map(Object::toString)
              .collect(Collectors.joining(", "));
    }
    return "Invalid value";
  }

  private static String message(MessageSourceResolvable error) {
    String message = error.getDefaultMessage();
    return message == null ? "Invalid value" : message;
  }

  private static List<FieldProblem> sorted(List<FieldProblem> problems) {
    return problems.stream().sorted(ORDER).toList();
  }
}
