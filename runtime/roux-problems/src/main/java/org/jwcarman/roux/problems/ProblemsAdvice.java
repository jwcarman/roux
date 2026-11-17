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

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.List;

import jakarta.validation.ConstraintViolationException;

import org.jspecify.annotations.Nullable;
import org.springframework.beans.TypeMismatchException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import tools.jackson.databind.exc.InvalidFormatException;

/**
 * Answers every error the API raises as an RFC 9457 Problem Detail. Spring MVC's own exceptions
 * come from {@link ResponseEntityExceptionHandler}; Bean Validation's and roux's own exceptions are
 * mapped here. Spring Security's, who's and jpa-utils' have their own advices ({@link
 * SecurityProblemsAdvice}, {@link WhoProblemsAdvice}, {@link PagingProblemsAdvice}), there only
 * when that library is. Features add no handlers of their own.
 */
@RestControllerAdvice
@Order(Ordered.LOWEST_PRECEDENCE - 1)
public class ProblemsAdvice extends ResponseEntityExceptionHandler {

  static final String INVALID_FIELDS = "The request has invalid fields";
  static final String SIGN_IN = "Sign in to continue";

  private final String apiPathPrefix;

  /**
   * Creates the advice.
   *
   * @param apiPathPrefix where the API's paths begin: a path under it that matches nothing is a
   *     problem, and any other is a page the error page renders
   */
  public ProblemsAdvice(String apiPathPrefix) {
    this.apiPathPrefix = apiPathPrefix;
  }

  /** A problem for {@code status}, its title the status's reason phrase. */
  static ProblemDetail problem(HttpStatus status, String detail) {
    return ProblemDetail.forStatusAndDetail(status, detail);
  }

  static ProblemDetail invalid(List<FieldProblem> errors) {
    ProblemDetail problem = problem(HttpStatus.BAD_REQUEST, INVALID_FIELDS);
    problem.setProperty("errors", errors);
    return problem;
  }

  @Override
  protected ResponseEntity<Object> handleMethodArgumentNotValid(
      MethodArgumentNotValidException ex,
      HttpHeaders headers,
      HttpStatusCode status,
      WebRequest request) {
    return handleExceptionInternal(
        ex, invalid(FieldErrors.of(ex.getBindingResult())), headers, status, request);
  }

  @Override
  protected ResponseEntity<Object> handleHandlerMethodValidationException(
      HandlerMethodValidationException ex,
      HttpHeaders headers,
      HttpStatusCode status,
      WebRequest request) {
    return handleExceptionInternal(
        ex, invalid(FieldErrors.of(ex.getParameterValidationResults())), headers, status, request);
  }

  /**
   * A body that cannot be read. A value that is not one of an enum's constants is a field error on
   * that field, {@code Must be one of A, B}; any other unreadable body stays Spring's generic 400.
   */
  @Override
  protected ResponseEntity<Object> handleHttpMessageNotReadable(
      HttpMessageNotReadableException ex,
      HttpHeaders headers,
      HttpStatusCode status,
      WebRequest request) {
    if (ex.getCause() instanceof InvalidFormatException invalid
        && invalid.getTargetType().isEnum()) {
      FieldProblem problem =
          new FieldProblem(
              FieldErrors.path(invalid.getPath()),
              FieldErrors.typeMessage(invalid.getTargetType()));
      return handleExceptionInternal(ex, invalid(List.of(problem)), headers, status, request);
    }
    return super.handleHttpMessageNotReadable(ex, headers, status, request);
  }

  @Override
  protected ResponseEntity<Object> handleTypeMismatch(
      TypeMismatchException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
    if (ex instanceof MethodArgumentTypeMismatchException mismatch) {
      if (mismatch.getParameter().hasParameterAnnotation(PathVariable.class)) {
        // a path that names nothing, like /members/not-a-uuid
        return handleExceptionInternal(
            ex,
            ProblemDetail.forStatus(HttpStatus.NOT_FOUND),
            headers,
            HttpStatus.NOT_FOUND,
            request);
      }
      String message = FieldErrors.typeMessage(mismatch.getRequiredType());
      return handleExceptionInternal(
          ex,
          invalid(List.of(new FieldProblem(mismatch.getName(), message))),
          headers,
          HttpStatus.BAD_REQUEST,
          request);
    }
    return super.handleTypeMismatch(ex, headers, status, request);
  }

  /**
   * A path that matches nothing. Under the API's path prefix ({@code /api/} unless {@code
   * roux.problems.api-path-prefix} says otherwise) it is a problem; anywhere else a browser asked
   * for a page, so the request goes on to the error page, where the app's own view renders "Page
   * not found".
   */
  @Override
  protected ResponseEntity<Object> handleNoResourceFoundException(
      NoResourceFoundException ex, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
    if (request instanceof ServletWebRequest servlet
        && !servlet.getRequest().getRequestURI().startsWith(apiPathPrefix)
        && servlet.getResponse() != null) {
      try {
        servlet.getResponse().sendError(HttpStatus.NOT_FOUND.value());
      } catch (IOException e) {
        throw new UncheckedIOException(e);
      }
      return null;
    }
    return super.handleNoResourceFoundException(ex, headers, status, request);
  }

  /** A 5xx Spring answers itself (an unwritable body, a conversion it cannot do) is logged too. */
  @Override
  protected ResponseEntity<Object> handleExceptionInternal(
      Exception ex,
      @Nullable Object body,
      HttpHeaders headers,
      HttpStatusCode statusCode,
      WebRequest request) {
    if (statusCode.is5xxServerError() && body instanceof ProblemDetail problem) {
      ServerErrors.logged(problem, ex);
    }
    return super.handleExceptionInternal(ex, body, headers, statusCode, request);
  }

  /** A {@code @Validated} service's input broke a constraint. */
  @ExceptionHandler(ConstraintViolationException.class)
  ProblemDetail constraintViolation(ConstraintViolationException ex) {
    return invalid(FieldErrors.of(ex.getConstraintViolations()));
  }

  @ExceptionHandler(InvalidFieldException.class)
  ProblemDetail invalidField(InvalidFieldException ex) {
    return invalid(List.of(new FieldProblem(ex.getField(), ex.getMessage())));
  }

  @ExceptionHandler(NotFoundException.class)
  ProblemDetail notFound(NotFoundException ex) {
    return problem(HttpStatus.NOT_FOUND, ex.getMessage());
  }

  @ExceptionHandler(InvariantViolationException.class)
  ProblemDetail invariantViolation(InvariantViolationException ex) {
    return problem(HttpStatus.BAD_REQUEST, ex.getMessage());
  }

  @ExceptionHandler(ConflictException.class)
  ProblemDetail conflict(ConflictException ex) {
    return problem(HttpStatus.CONFLICT, ex.getMessage());
  }

  @ExceptionHandler(OptimisticLockingFailureException.class)
  ProblemDetail stale() {
    return problem(HttpStatus.CONFLICT, "This record changed since you loaded it");
  }

  /** Never the database's message: it names tables, constraints and values. */
  @ExceptionHandler(DataIntegrityViolationException.class)
  ProblemDetail integrity() {
    return problem(HttpStatus.CONFLICT, "This conflicts with existing data");
  }
}
