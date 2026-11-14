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

import java.util.List;
import java.util.Map;
import java.util.Objects;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

import org.jwcarman.jpa.pagination.PageDto;
import org.jwcarman.jpa.pagination.PaginationDto;
import org.jwcarman.jpa.pagination.UnknownSortByValueException;
import org.jwcarman.jpa.spring.web.PageParams;
import org.jwcarman.roux.problems.ConflictException;
import org.jwcarman.roux.problems.InvariantViolationException;
import org.jwcarman.roux.problems.NotFoundException;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** The endpoints that raise, or return, what the contract fixtures describe. */
@RestController
class ContractTestController {

  /** The sign-in bootstrap path: public, and the first response sets the CSRF cookie. */
  @GetMapping("/who/me")
  String me(CsrfToken token) {
    // reading the token makes Spring Security write the XSRF-TOKEN cookie
    Objects.requireNonNull(token.getToken());
    return "{}";
  }

  record Row(String id, String name) {}

  record NewNote(@NotBlank String title) {}

  @GetMapping("/api/contract/not-found")
  String notFound() {
    throw new NotFoundException("No note 42");
  }

  @PostMapping("/api/contract/invalid-fields")
  String invalidFields(@Valid @RequestBody NewNote note) {
    return note.title();
  }

  @GetMapping("/api/contract/invariant")
  String invariant() {
    throw new InvariantViolationException("A class meets at most %d times a week", 7);
  }

  @GetMapping("/api/contract/conflict")
  String conflict() {
    throw new ConflictException("The name %s is taken", "Ada");
  }

  @GetMapping("/api/contract/server-error")
  String serverError() {
    throw new IllegalStateException("secret internals");
  }

  @GetMapping("/api/contract/page")
  PageDto<Row> page(@RequestParam(required = false) String sortBy) {
    if (sortBy != null) {
      throw new UnknownSortByValueException(sortBy, new String[] {"id", "name"});
    }
    return new PageDto<>(
        List.of(new Row("1", "Ada"), new Row("2", "Grace")),
        new PaginationDto(0, 2, 3, 2, true, false));
  }

  @GetMapping("/api/contract/echo-params")
  PageParams echoParams(PageParams params) {
    return params;
  }

  @PostMapping("/api/contract/echo")
  Map<String, String> echo(@RequestBody Map<String, String> body) {
    return body;
  }
}
