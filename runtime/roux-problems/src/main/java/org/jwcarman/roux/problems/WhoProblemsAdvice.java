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

import org.jwcarman.who.spring.security.web.InvalidPasskeyRegistrationException;
import org.jwcarman.who.spring.security.web.ReauthenticationRequiredException;
import org.jwcarman.who.spring.security.web.SignInFailedException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * who's errors as problems. Ahead of {@link SecurityProblemsAdvice}, as who's sign-in failures are
 * Spring Security {@code AuthenticationException}s that would otherwise answer as a plain "Sign in
 * to continue".
 */
@RestControllerAdvice
@Order(Ordered.LOWEST_PRECEDENCE - 3)
public class WhoProblemsAdvice {

  /** who's sign-in failure: never the reason, which who keeps out of the response too. */
  @ExceptionHandler(SignInFailedException.class)
  ProblemDetail signInFailed() {
    return ProblemsAdvice.problem(HttpStatus.UNAUTHORIZED, "Sign-in failed");
  }

  @ExceptionHandler(ReauthenticationRequiredException.class)
  ProblemDetail reauthenticate() {
    return ProblemsAdvice.problem(HttpStatus.UNAUTHORIZED, "Sign in again to continue");
  }

  @ExceptionHandler(InvalidPasskeyRegistrationException.class)
  ProblemDetail invalidPasskey() {
    return ProblemsAdvice.problem(HttpStatus.BAD_REQUEST, "The passkey could not be registered");
  }
}
