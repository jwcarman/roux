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
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

import java.io.IOException;
import java.io.UncheckedIOException;

import org.junit.jupiter.api.Test;
import org.springframework.beans.TypeMismatchException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.resource.NoResourceFoundException;

/** The advice's paths a running application seldom takes, called directly. */
class ProblemsAdviceUnitTest {

  private final ProblemsAdvice advice =
      new ProblemsAdvice(new RouxProblemsProperties(true, "/api/"));

  private static NoResourceFoundException missing(String path) {
    return new NoResourceFoundException(HttpMethod.GET, path, path);
  }

  private static ProblemDetail problem(ResponseEntity<Object> response) {
    assertThat(response).isNotNull();
    return (ProblemDetail) response.getBody();
  }

  @Test
  void aTypeMismatchOutsideAControllerArgumentIsSpringsOwnProblem() {
    ResponseEntity<Object> response =
        advice.handleTypeMismatch(
            new TypeMismatchException("abc", Integer.class),
            new HttpHeaders(),
            HttpStatus.BAD_REQUEST,
            mock(WebRequest.class));
    assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    assertThat(problem(response).getProperties()).isNull();
  }

  @Test
  void aMissingPageOutsideAServletRequestIsAProblem() {
    ResponseEntity<Object> response =
        advice.handleNoResourceFoundException(
            missing("/page"), new HttpHeaders(), HttpStatus.NOT_FOUND, mock(WebRequest.class));
    assertThat(problem(response).getStatus()).isEqualTo(404);
  }

  @Test
  void aMissingPageWithoutAResponseToSendTheErrorOnIsAProblem() {
    ServletWebRequest request = new ServletWebRequest(new MockHttpServletRequest("GET", "/page"));
    ResponseEntity<Object> response =
        advice.handleNoResourceFoundException(
            missing("/page"), new HttpHeaders(), HttpStatus.NOT_FOUND, request);
    assertThat(problem(response).getStatus()).isEqualTo(404);
  }

  @Test
  void aMissingPageThatCannotBeSentOnFailsUnchecked() {
    MockHttpServletResponse broken =
        new MockHttpServletResponse() {
          @Override
          public void sendError(int status) throws IOException {
            throw new IOException("connection reset");
          }
        };
    ServletWebRequest request =
        new ServletWebRequest(new MockHttpServletRequest("GET", "/page"), broken);
    assertThatThrownBy(
            () ->
                advice.handleNoResourceFoundException(
                    missing("/page"), new HttpHeaders(), HttpStatus.NOT_FOUND, request))
        .isInstanceOf(UncheckedIOException.class)
        .hasRootCauseMessage("connection reset");
  }

  @Test
  void aServerErrorWithoutAProblemBodyIsPassedOnAsItIs() {
    ResponseEntity<Object> response =
        advice.handleExceptionInternal(
            new IllegalStateException("boom"),
            "plain",
            new HttpHeaders(),
            HttpStatus.INTERNAL_SERVER_ERROR,
            mock(WebRequest.class));
    assertThat(response.getBody()).isEqualTo("plain");
  }

  @Test
  void aClientErrorIsNotLogged() {
    ProblemDetail body = ProblemDetail.forStatus(HttpStatus.BAD_REQUEST);
    advice.handleExceptionInternal(
        new IllegalStateException("bad"),
        body,
        new HttpHeaders(),
        HttpStatus.BAD_REQUEST,
        mock(WebRequest.class));
    assertThat(body.getProperties()).isNull();
  }
}
