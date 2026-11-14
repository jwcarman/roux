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

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.ProblemDetail;
import org.springframework.security.core.context.SecurityContextHolder;

class SecurityProblemsAdviceUnitTest {

  @AfterEach
  void clear() {
    SecurityContextHolder.clearContext();
  }

  @Test
  void deniedWithNoAuthenticationAtAllIsSignIn() {
    SecurityContextHolder.clearContext();

    ProblemDetail problem = new SecurityProblemsAdvice().denied();

    assertThat(problem.getStatus()).isEqualTo(401);
    assertThat(problem.getDetail()).isEqualTo(ProblemsAdvice.SIGN_IN);
  }
}
