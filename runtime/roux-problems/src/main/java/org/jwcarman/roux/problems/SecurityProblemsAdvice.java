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

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/** Spring Security's errors as problems. */
@RestControllerAdvice
@Order(Ordered.LOWEST_PRECEDENCE - 2)
public class SecurityProblemsAdvice {

  /**
   * Signed in without the permission: 403. Anonymous (method security let the URL through): 401.
   */
  @ExceptionHandler(AccessDeniedException.class)
  ProblemDetail denied() {
    Authentication caller = SecurityContextHolder.getContext().getAuthentication();
    if (caller == null || caller instanceof AnonymousAuthenticationToken) {
      return ProblemsAdvice.problem(HttpStatus.UNAUTHORIZED, ProblemsAdvice.SIGN_IN);
    }
    return ProblemsAdvice.problem(HttpStatus.FORBIDDEN, "You do not have permission");
  }

  /** who's {@code NotSignedInException}, and any other authentication failure. */
  @ExceptionHandler(AuthenticationException.class)
  ProblemDetail unauthenticated() {
    return ProblemsAdvice.problem(HttpStatus.UNAUTHORIZED, ProblemsAdvice.SIGN_IN);
  }
}
