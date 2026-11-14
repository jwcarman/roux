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

import java.util.List;

import org.jwcarman.jpa.pagination.UnknownSortByValueException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** jpa-utils' paging errors as problems. */
@RestControllerAdvice
@Order(Ordered.LOWEST_PRECEDENCE - 2)
public class PagingProblemsAdvice {

  @ExceptionHandler(UnknownSortByValueException.class)
  ProblemDetail unknownSort(UnknownSortByValueException ex) {
    return ProblemsAdvice.invalid(List.of(new FieldProblem("sortBy", ex.getMessage())));
  }
}
