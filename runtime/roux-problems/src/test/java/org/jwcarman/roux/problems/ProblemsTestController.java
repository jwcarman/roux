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

import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.HttpMessageNotWritableException;
import org.springframework.stereotype.Service;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;

/** Endpoints that raise each kind of error the template answers, for its tests. */
@RestController
@RequestMapping("/api/test/problems")
class ProblemsTestController {

  record Named(@NotBlank String name) {}

  record Short(@Size(max = 5) String text) {}

  record Note(String note) {}

  record Feeling(Mood mood) {}

  record Feelings(List<Feeling> feelings) {}

  record Count(int count) {}

  @PostMapping("/feeling")
  String feeling(@RequestBody Feeling body) {
    return String.valueOf(body.mood());
  }

  @PostMapping("/feelings")
  String feelings(@RequestBody Feelings body) {
    return String.valueOf(body.feelings());
  }

  @PostMapping("/count")
  String count(@RequestBody Count body) {
    return String.valueOf(body.count());
  }

  record Code(@Size(min = 2, max = 5) String code) {}

  @PostMapping("/code")
  String code(@Valid @RequestBody Code body) {
    return body.code();
  }

  @GetMapping("/unwritable")
  String unwritable() {
    throw new HttpMessageNotWritableException("no converter for a native-only type");
  }

  @ResponseStatus(HttpStatus.SERVICE_UNAVAILABLE)
  static class DownException extends RuntimeException {
    private static final long serialVersionUID = 1L;
  }

  @GetMapping("/unavailable")
  String unavailable() {
    throw new DownException();
  }

  private final NoteService notes;

  ProblemsTestController(NoteService notes) {
    this.notes = notes;
  }

  @PostMapping("/named")
  String named(@Valid @RequestBody Named body) {
    return body.name();
  }

  @PostMapping("/short")
  String shortText(@Valid @RequestBody Short body) {
    return body.text();
  }

  @GetMapping("/missing")
  String missing() {
    throw new NotFoundException("No such thing");
  }

  @GetMapping("/by-id")
  String byId(@RequestParam UUID id) {
    return id.toString();
  }

  @GetMapping("/things/{id}")
  String thing(@PathVariable UUID id) {
    return id.toString();
  }

  enum Mood {
    CALM,
    GRUMPY
  }

  @GetMapping("/mood")
  String mood(@RequestParam Mood mood) {
    return mood.name();
  }

  @GetMapping("/rule")
  String rule() {
    throw new InvalidFieldException("dateOfBirth", "Must not be after today");
  }

  @GetMapping("/invariant")
  String invariant() {
    throw new InvariantViolationException("A class meets at most %d times a week", 7);
  }

  @GetMapping("/note")
  String note() {
    throw new InvalidFieldException("note", "Must be at most %d characters", 500);
  }

  @GetMapping("/tag")
  String tag(@RequestParam @Size(max = 3) String tag) {
    return tag;
  }

  @PostMapping("/tagged")
  String tagged(@RequestParam @Size(max = 3) String tag, @Valid @RequestBody Named body) {
    return tag + body.name();
  }

  @GetMapping("/conflict")
  String conflict() {
    throw new ConflictException("The name %s is taken", "Ada");
  }

  enum Direction {
    ASC,
    DESC
  }

  /** A query bound as an object, as a paged list's parameters are. */
  record Page(Integer pageIndex, Direction sortDirection) {}

  @GetMapping("/page")
  String page(Page page) {
    return page.toString();
  }

  @GetMapping("/stale")
  String stale() {
    throw new OptimisticLockingFailureException("row was updated by another transaction");
  }

  @GetMapping("/duplicate")
  String duplicate() {
    throw new DataIntegrityViolationException(
        "duplicate key value violates unique constraint uq_secret_index");
  }

  @GetMapping("/broken")
  String broken() {
    throw new IllegalStateException("password=hunter2 select * from secrets");
  }

  @GetMapping("/gone-away")
  String goneAway() throws AsyncRequestNotUsableException {
    throw new AsyncRequestNotUsableException("client went away");
  }

  @ResponseStatus(value = HttpStatus.GONE, reason = "That has gone")
  static class GoneException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    GoneException() {
      super("internal detail that must not show");
    }
  }

  @GetMapping("/gone")
  String gone() {
    throw new GoneException();
  }

  @PostMapping("/note")
  String note(@RequestBody Note body) {
    notes.note(body.note());
    return body.note();
  }

  /** A service validating its own input, as the template's services do. */
  @Service
  @Validated
  static class NoteService {
    public void note(@Size(max = 3) String note) {
      // accepted
    }
  }
}
