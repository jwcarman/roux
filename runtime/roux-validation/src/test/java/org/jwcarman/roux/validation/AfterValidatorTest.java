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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Set;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import jakarta.validation.constraints.NotNull;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.validation.sample.Samples;

class AfterValidatorTest {

  @After(field = "endsAt", other = "startsAt")
  record Meeting(@NotNull LocalTime startsAt, @NotNull LocalTime endsAt) {}

  @After(field = "end", other = "start", otherLabel = "the first day")
  record Stay(LocalDate start, LocalDate end) {}

  @After(field = "to", other = "from")
  record Window(Instant from, Instant to) {}

  @After(field = "max", other = "min")
  record Range(Integer min, Integer max) {}

  /** A bean with getters, as a class that is not a record has. */
  @After(field = "finish", other = "begin")
  @After(field = "begin", other = "created", message = "Begin comes later")
  static class Job {
    private final LocalDate created = LocalDate.of(2026, 1, 1);
    private final LocalDate begin;
    private final LocalDate finish;
    private final boolean flag = true;

    Job(LocalDate begin, LocalDate finish) {
      this.begin = begin;
      this.finish = finish;
    }

    public LocalDate getBegin() {
      return begin;
    }

    public boolean isFlag() {
      return flag;
    }
  }

  @After(field = "b", other = "a")
  record Mixed(Integer a, Long b) {}

  @After(field = "b", other = "a")
  record Unordered(Object a, Object b) {}

  @After(field = "b", other = "missing")
  record Missing(Integer a, Integer b) {}

  @After(field = "b", other = "a")
  static class Thrower {
    public Integer getA() {
      throw new UnsupportedOperationException("boom");
    }

    public Integer b = 1;
  }

  private static final ValidatorFactory FACTORY = Validation.buildDefaultValidatorFactory();
  private static final Validator VALIDATOR = FACTORY.getValidator();

  @AfterAll
  static void close() {
    FACTORY.close();
  }

  private static List<String> report(Object value) {
    Set<ConstraintViolation<Object>> violations = VALIDATOR.validate(value);
    return violations.stream()
        .map(v -> v.getPropertyPath() + ": " + v.getMessage())
        .sorted()
        .toList();
  }

  @Test
  void aLaterTimeIsValid() {
    assertThat(report(new Meeting(LocalTime.of(9, 0), LocalTime.of(10, 0)))).isEmpty();
  }

  @Test
  void anEarlierTimeIsAFieldErrorOnTheLaterField() {
    assertThat(report(new Meeting(LocalTime.of(10, 0), LocalTime.of(9, 0))))
        .containsExactly("endsAt: Must be after starts at");
  }

  @Test
  void anEqualTimeIsNotAfter() {
    assertThat(report(new Meeting(LocalTime.of(9, 0), LocalTime.of(9, 0))))
        .containsExactly("endsAt: Must be after starts at");
  }

  @Test
  void aNullIsLeftToNotNull() {
    assertThat(report(new Meeting(null, LocalTime.of(9, 0))))
        .containsExactly("startsAt: Must not be empty");
    assertThat(report(new Stay(null, LocalDate.now()))).isEmpty();
    assertThat(report(new Stay(LocalDate.now(), null))).isEmpty();
  }

  @Test
  void aLabelNamesTheOtherFieldInTheMessage() {
    assertThat(report(new Stay(LocalDate.of(2026, 3, 2), LocalDate.of(2026, 3, 1))))
        .containsExactly("end: Must be after the first day");
    assertThat(report(new Stay(LocalDate.of(2026, 3, 1), LocalDate.of(2026, 3, 2)))).isEmpty();
  }

  @Test
  void instantsAndNumbersCompareToo() {
    Instant noon = Instant.parse("2026-03-01T12:00:00Z");
    assertThat(report(new Window(noon, noon.plusSeconds(1)))).isEmpty();
    assertThat(report(new Window(noon, noon.minusSeconds(1))))
        .containsExactly("to: Must be after from");
    assertThat(report(new Range(1, 2))).isEmpty();
    assertThat(report(new Range(2, 1))).containsExactly("max: Must be after min");
  }

  @Test
  void aClassWithGettersAndFieldsIsReadToo() {
    assertThat(report(new Job(LocalDate.of(2026, 2, 1), LocalDate.of(2026, 3, 1)))).isEmpty();
    assertThat(report(new Job(LocalDate.of(2025, 2, 1), LocalDate.of(2024, 3, 1))))
        .containsExactly("begin: Begin comes later", "finish: Must be after begin");
  }

  @Test
  void twoValuesThatCannotBeComparedAreABug() {
    assertThatThrownBy(() -> report(new Mixed(1, 2L)))
        .hasStackTraceContaining("Mixed: b (Long) and a (Integer) cannot be compared");
    assertThatThrownBy(() -> report(new Unordered(new Object(), new Object())))
        .hasStackTraceContaining("cannot be compared");
  }

  @Test
  void aFieldThatDoesNotExistIsABug() {
    assertThatThrownBy(() -> report(new Missing(1, 2))).hasStackTraceContaining("no field missing");
  }

  @Test
  void aGetterThatFailsIsABug() {
    assertThatThrownBy(() -> report(new Thrower())).hasStackTraceContaining("boom");
  }

  @Test
  void aTypeThatIsNotPublicIsReadByItsAccessorsAndByItsFields() {
    assertThat(report(Samples.meeting(LocalTime.of(9, 0), LocalTime.of(10, 0)))).isEmpty();
    assertThat(report(Samples.meeting(LocalTime.of(9, 0), LocalTime.of(8, 0))))
        .containsExactly("endsAt: Must be after starts at");
    assertThat(report(Samples.hidden(1, 2))).isEmpty();
    assertThat(report(Samples.hidden(2, 1))).containsExactly("b: Must be after a");
  }

  @Test
  void noObjectIsValid() {
    assertThat(new AfterValidator().isValid(null, null)).isTrue();
  }

  @Test
  void aFieldNameIsWords() {
    assertThat(AfterValidator.words("startsAt")).isEqualTo("starts at");
    assertThat(AfterValidator.words("start")).isEqualTo("start");
    assertThat(AfterValidator.words("line2Start")).isEqualTo("line2 start");
  }
}
