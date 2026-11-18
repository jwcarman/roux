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

import java.net.URI;

import org.jwcarman.who.spring.security.web.ReauthenticationRequiredException;
import org.jwcarman.who.spring.security.web.SignInFailedException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * who's exceptions on the app's own endpoints, as problems in who's own shape ({@code type} {@code
 * urn:who:error:<code>} and a {@code code} member), so a client reads one shape for who's errors
 * wherever they come from. Under who's base path, who answers every error itself and this advice
 * never runs. Ahead of {@link SecurityProblemsAdvice}, as who's exceptions are Spring Security
 * {@code AuthenticationException}s that would otherwise answer as a plain "Sign in to continue".
 */
@RestControllerAdvice
@Order(Ordered.LOWEST_PRECEDENCE - 3)
public class WhoProblemsAdvice {

  private static final String ERROR_TYPE = "urn:who:error:";

  /** A sign-in failed: never the reason, which who keeps out of the response too. */
  @ExceptionHandler(SignInFailedException.class)
  ProblemDetail signInFailed() {
    return whoProblem("sign-in-failed", HttpStatus.UNAUTHORIZED, "Sign-in failed");
  }

  /** An action marked {@code @RequiresRecentSignIn} on one of the app's endpoints. */
  @ExceptionHandler(ReauthenticationRequiredException.class)
  ProblemDetail reauthenticate() {
    return whoProblem(
        "reauthentication-required", HttpStatus.UNAUTHORIZED, "Sign in again to continue");
  }

  private static ProblemDetail whoProblem(String code, HttpStatus status, String detail) {
    ProblemDetail problem = ProblemsAdvice.problem(status, detail);
    problem.setType(URI.create(ERROR_TYPE + code));
    problem.setProperty("code", code);
    return problem;
  }
}
