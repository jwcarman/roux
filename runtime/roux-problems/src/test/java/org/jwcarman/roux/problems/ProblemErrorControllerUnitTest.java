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

import java.util.Map;

import jakarta.servlet.RequestDispatcher;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.boot.autoconfigure.web.WebProperties;
import org.springframework.boot.webmvc.autoconfigure.error.ErrorViewResolver;
import org.springframework.boot.webmvc.error.DefaultErrorAttributes;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

class ProblemErrorControllerUnitTest {

  private final ProblemErrorController controller =
      new ProblemErrorController(
          new DefaultErrorAttributes(),
          new WebProperties(),
          new StaticListableBeanFactory().getBeanProvider(ErrorViewResolver.class));

  @Test
  void anErrorWithoutTheRequestedPathHasNoInstance() {
    MockHttpServletRequest request = new MockHttpServletRequest();
    request.setAttribute(RequestDispatcher.ERROR_STATUS_CODE, 404);
    ResponseEntity<Map<String, Object>> response = controller.error(request);
    assertThat(response.getStatusCode().value()).isEqualTo(404);
    assertThat(response.getBody())
        .containsExactly(Map.entry("title", "Not Found"), Map.entry("status", 404));
  }
}
