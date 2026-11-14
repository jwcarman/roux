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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.lang.reflect.Method;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.ElementKind;
import jakarta.validation.Path;
import jakarta.validation.Valid;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import org.junit.jupiter.api.Test;
import org.springframework.context.support.DefaultMessageSourceResolvable;
import org.springframework.core.MethodParameter;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.validation.FieldError;
import org.springframework.validation.method.ParameterValidationResult;

class FieldErrorsTest {

  private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

  record Address(@NotBlank String city) {}

  record Item(@Positive int quantity) {}

  record Order(@NotBlank String displayName, @Valid Address address, List<@Valid Item> items) {}

  @Test
  void bodyFieldsKeepTheirPaths() {
    Set<ConstraintViolation<Order>> violations =
        validator.validate(new Order(" ", new Address(""), List.of(new Item(0))));
    assertThat(FieldErrors.of(Set.copyOf(violations)))
        .extracting(FieldProblem::field)
        .containsExactly("address.city", "displayName", "items[0].quantity");
  }

  @Test
  void bindingResultFieldsAreSortedByFieldThenMessage() {
    BeanPropertyBindingResult result = new BeanPropertyBindingResult(new Object(), "body");
    result.addError(new FieldError("body", "name", "Must not be blank"));
    result.addError(new FieldError("body", "email", "Must be a valid email address"));
    result.addError(new FieldError("body", "email", "Must not be blank"));
    assertThat(FieldErrors.of(result))
        .containsExactly(
            new FieldProblem("email", "Must be a valid email address"),
            new FieldProblem("email", "Must not be blank"),
            new FieldProblem("name", "Must not be blank"));
  }

  static class Service {
    public void invite(@Valid Invitation invitation) {
      // only the signature matters: the validator reads its constraints
    }

    public void note(@Size(max = 3) String note) {
      // only the signature matters: the validator reads its constraints
    }
  }

  record Invitation(@NotBlank String email) {}

  @Test
  void serviceViolationDropsMethodAndParameter() throws Exception {
    Method invite = Service.class.getMethod("invite", Invitation.class);
    Method note = Service.class.getMethod("note", String.class);
    Set<ConstraintViolation<Service>> onRecord =
        validator
            .forExecutables()
            .validateParameters(new Service(), invite, new Object[] {new Invitation("")});
    Set<ConstraintViolation<Service>> onParameter =
        validator.forExecutables().validateParameters(new Service(), note, new Object[] {"long"});
    // a record's own fields are what the client sent; a plain parameter keeps its name
    assertThat(FieldErrors.of(Set.copyOf(onRecord)))
        .extracting(FieldProblem::field)
        .containsExactly("email");
    assertThat(FieldErrors.of(Set.copyOf(onParameter)))
        .extracting(FieldProblem::field)
        .containsExactly("note");
  }

  record Labelled(Map<String, @NotBlank String> labels, Set<@NotBlank String> tags) {}

  @Test
  void aMapValueIsNamedByItsKeyAndASetElementByItsField() {
    Set<ConstraintViolation<Labelled>> violations =
        validator.validate(new Labelled(Map.of("colour", ""), Set.of("")));
    assertThat(FieldErrors.of(Set.copyOf(violations)))
        .extracting(FieldProblem::field)
        .containsExactly("labels[colour]", "tags");
  }

  static class Hire {
    public Hire(@NotBlank String name) {}

    public @Valid Invitation invitation() {
      return new Invitation("");
    }
  }

  @Test
  void aConstructorViolationDropsTheConstructor() throws Exception {
    Set<ConstraintViolation<Hire>> violations =
        validator
            .forExecutables()
            .validateConstructorParameters(
                Hire.class.getConstructor(String.class), new Object[] {""});
    assertThat(FieldErrors.of(Set.copyOf(violations)))
        .extracting(FieldProblem::field)
        .containsExactly("name");
  }

  @Test
  void aReturnValueViolationKeepsTheReturnValue() throws Exception {
    Method invitation = Hire.class.getMethod("invitation");
    Set<ConstraintViolation<Hire>> violations =
        validator
            .forExecutables()
            .validateReturnValue(new Hire("Ada"), invitation, new Invitation(""));
    assertThat(FieldErrors.of(Set.copyOf(violations)))
        .extracting(FieldProblem::field)
        .containsExactly("<return value>.email");
  }

  private static Path.Node node(ElementKind kind, String name) {
    Path.Node node = mock(Path.Node.class);
    when(node.getKind()).thenReturn(kind);
    when(node.getName()).thenReturn(name);
    return node;
  }

  private static ConstraintViolation<?> violation(Path path) {
    ConstraintViolation<?> violation = mock(ConstraintViolation.class);
    when(violation.getPropertyPath()).thenReturn(path);
    when(violation.getMessage()).thenReturn("Must not be blank");
    return violation;
  }

  @Test
  void anEmptyPathIsTheWholeObject() {
    Path empty = Collections::emptyIterator;
    assertThat(FieldErrors.of(Set.of(violation(empty))))
        .containsExactly(new FieldProblem("", "Must not be blank"));
  }

  @Test
  void aNodeWithoutANameAddsNothing() {
    List<Path.Node> nodes =
        List.of(node(ElementKind.BEAN, null), node(ElementKind.PROPERTY, "email"));
    Path path = nodes::iterator;
    assertThat(FieldErrors.of(Set.of(violation(path))))
        .extracting(FieldProblem::field)
        .containsExactly("email");
  }

  static class Notes {
    public void tag(String tag) {
      // only the signature matters: the validator reads its constraints
    }
  }

  @Test
  void aParameterWithoutANameOrMessageIsStillAProblem() throws Exception {
    // a parameter whose name was not discovered, with an error that has no default message
    MethodParameter parameter =
        new MethodParameter(Notes.class.getMethod("tag", String.class), 0) {
          @Override
          public String getParameterName() {
            return null;
          }
        };
    ParameterValidationResult result =
        new ParameterValidationResult(
            parameter,
            "long",
            List.of(new DefaultMessageSourceResolvable("Size")),
            null,
            null,
            null,
            (error, type) -> error);
    assertThat(FieldErrors.of(List.of(result)))
        .containsExactly(new FieldProblem("", "Invalid value"));
  }

  @Test
  void aBindingFailureWithoutATypeMismatchIsJustInvalid() {
    BeanPropertyBindingResult result = new BeanPropertyBindingResult(new Object(), "body");
    result.addError(
        new FieldError("body", "pageIndex", "abc", true, null, null, "Failed to convert"));
    assertThat(FieldErrors.of(result))
        .containsExactly(new FieldProblem("pageIndex", "Invalid value"));
  }
}
