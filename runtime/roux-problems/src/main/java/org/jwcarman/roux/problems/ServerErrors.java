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

import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ProblemDetail;

/**
 * A server error the client is told nothing about: logged at ERROR with an {@code errorId} the
 * problem carries too, so a user's report can be matched to the log.
 */
final class ServerErrors {

  private static final Logger log = LoggerFactory.getLogger(ServerErrors.class);

  private ServerErrors() {}

  static ProblemDetail logged(ProblemDetail problem, Throwable cause) {
    UUID errorId = UUID.randomUUID();
    log.error("Server error, errorId {}", errorId, cause);
    problem.setProperty("errorId", errorId.toString());
    return problem;
  }
}
