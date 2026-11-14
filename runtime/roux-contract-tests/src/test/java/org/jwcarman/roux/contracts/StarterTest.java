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
package org.jwcarman.roux.contracts;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.jwcarman.jpa.spring.web.PagingWebAutoConfiguration;
import org.jwcarman.roux.problems.PagingProblemsAdvice;
import org.jwcarman.roux.problems.ProblemsAdvice;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;

/** The starter alone brings the whole contract: roux's advices and jpa-utils' paging. */
@SpringBootTest(classes = ContractTestApplication.class)
class StarterTest {

  @Autowired ApplicationContext context;

  @Test
  void starterBringsTheWholeContract() {
    assertThat(context.getBeanNamesForType(ProblemsAdvice.class)).hasSize(1);
    assertThat(context.getBeanNamesForType(PagingProblemsAdvice.class)).hasSize(1);
    assertThat(context.getBeanNamesForType(PagingWebAutoConfiguration.class)).hasSize(1);
  }
}
