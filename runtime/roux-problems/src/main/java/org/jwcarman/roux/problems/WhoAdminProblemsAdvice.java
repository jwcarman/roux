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

import org.jwcarman.who.admin.LastAdminException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * who-admin's exceptions on the app's own endpoints, in who's shape as {@link WhoProblemsAdvice}
 * answers who's others: an app's service that wraps a demotion or deactivation in who-admin's
 * {@code LastAdminGuard} gets the same {@code last-admin} problem who-admin's own endpoints answer,
 * in words the app's people read. A separate advice so who-admin stays optional.
 */
@RestControllerAdvice
@Order(Ordered.LOWEST_PRECEDENCE - 3)
public class WhoAdminProblemsAdvice {

  /** The change would leave no active identity that may manage people. */
  @ExceptionHandler(LastAdminException.class)
  ProblemDetail lastAdmin() {
    return WhoProblemsAdvice.whoProblem(
        "last-admin", HttpStatus.CONFLICT, "The team needs someone active who can manage people");
  }
}
