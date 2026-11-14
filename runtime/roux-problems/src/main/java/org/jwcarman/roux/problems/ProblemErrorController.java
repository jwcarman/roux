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

import java.util.LinkedHashMap;
import java.util.Map;

import jakarta.servlet.RequestDispatcher;
import jakarta.servlet.http.HttpServletRequest;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.web.WebProperties;
import org.springframework.boot.webmvc.autoconfigure.error.BasicErrorController;
import org.springframework.boot.webmvc.autoconfigure.error.ErrorViewResolver;
import org.springframework.boot.webmvc.error.ErrorAttributes;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/**
 * Spring Boot's error page, answering a JSON client with a Problem Detail. A response reaches
 * {@code /error} when something calls {@code sendError} without an exception the advices saw, such
 * as who's fallback or the servlet container itself. A browser keeps Spring Boot's HTML page.
 */
public class ProblemErrorController extends BasicErrorController {

  public ProblemErrorController(
      ErrorAttributes errorAttributes,
      WebProperties webProperties,
      ObjectProvider<ErrorViewResolver> errorViewResolvers) {
    super(errorAttributes, webProperties.getError(), errorViewResolvers.orderedStream().toList());
  }

  /**
   * Any client that is not asking for HTML, whatever it sends as {@code Accept} (anything, none,
   * JSON): a Problem Detail, as every other error the API answers.
   */
  @Override
  public ResponseEntity<Map<String, Object>> error(HttpServletRequest request) {
    HttpStatus status = getStatus(request);
    Map<String, Object> problem = new LinkedHashMap<>();
    problem.put("title", status.getReasonPhrase());
    problem.put("status", status.value());
    if (request.getAttribute(RequestDispatcher.ERROR_REQUEST_URI) instanceof String path) {
      problem.put("instance", path);
    }
    return ResponseEntity.status(status)
        .contentType(MediaType.APPLICATION_PROBLEM_JSON)
        .body(problem);
  }
}
