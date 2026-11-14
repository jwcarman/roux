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

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;

/**
 * The last resort: anything no other handler answered is a 500 that says nothing about its cause.
 * The exception is logged with an {@code errorId} the response carries too, so a user's report can
 * be matched to the log. A separate advice, ordered last, so any other handler wins over it.
 */
@RestControllerAdvice
@Order(Ordered.LOWEST_PRECEDENCE)
public class RootProblemsAdvice {

  private static final Logger log = LoggerFactory.getLogger(RootProblemsAdvice.class);

  /** A client that went away mid-response: nothing to answer and nothing wrong. */
  @ExceptionHandler(AsyncRequestNotUsableException.class)
  void clientWentAway(AsyncRequestNotUsableException ex) {
    log.trace("Client went away: {}", ex.getMessage());
  }

  @ExceptionHandler(Exception.class)
  ProblemDetail unexpected(Exception ex) {
    ResponseStatus declared =
        AnnotatedElementUtils.findMergedAnnotation(ex.getClass(), ResponseStatus.class);
    if (declared != null) {
      // an exception that names its own status keeps it; only the annotation's reason is shown
      ProblemDetail problem = ProblemDetail.forStatus(declared.code());
      if (!declared.reason().isEmpty()) {
        problem.setDetail(declared.reason());
      }
      return declared.code().is5xxServerError() ? ServerErrors.logged(problem, ex) : problem;
    }
    return ServerErrors.logged(
        ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "Something went wrong"),
        ex);
  }
}
