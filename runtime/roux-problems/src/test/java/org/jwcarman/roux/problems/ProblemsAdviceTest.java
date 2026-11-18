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
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.jayway.jsonpath.JsonPath;

@SpringBootTest(classes = ProblemsTestApplication.class)
@AutoConfigureMockMvc
@Import({ProblemsTestController.class, ProblemsTestController.NoteService.class})
class ProblemsAdviceTest {

  @Autowired MockMvc mvc;

  /** The request, signed in. */
  private ResultActions perform(MockHttpServletRequestBuilder request) throws Exception {
    return mvc.perform(request.with(user("tester")));
  }

  private ResultActions postJson(String path, String body) throws Exception {
    return perform(
        post("/api/test/problems" + path).contentType(MediaType.APPLICATION_JSON).content(body));
  }

  static ResultActions isProblem(ResultActions result, int status, String title) throws Exception {
    return result
        .andExpect(status().is(status))
        .andExpect(header().string("Content-Type", startsWith("application/problem+json")))
        // RFC 9457: an absent type means about:blank, which Spring leaves out
        .andExpect(jsonPath("$.type").doesNotExist())
        .andExpect(jsonPath("$.title").value(title))
        .andExpect(jsonPath("$.status").value(status));
  }

  @Test
  void invalidBodyIsAProblem() throws Exception {
    isProblem(postJson("/named", "{\"name\":\"\"}"), 400, "Bad Request")
        .andExpect(jsonPath("$.detail").value("The request has invalid fields"))
        .andExpect(jsonPath("$.instance").value("/api/test/problems/named"))
        .andExpect(jsonPath("$.errors.length()").value(1))
        .andExpect(jsonPath("$.errors[0].field").value("name"))
        .andExpect(jsonPath("$.errors[0].message").value("Must not be blank"));
  }

  @Test
  void sizeMessageIsReadable() throws Exception {
    isProblem(postJson("/short", "{\"text\":\"sixsix\"}"), 400, "Bad Request")
        .andExpect(jsonPath("$.errors[0].message").value("Must be between 0 and 5 characters"));
  }

  @Test
  void serviceViolationNamesTheParameter() throws Exception {
    isProblem(postJson("/note", "{\"note\":\"long\"}"), 400, "Bad Request")
        .andExpect(jsonPath("$.detail").value("The request has invalid fields"))
        .andExpect(jsonPath("$.errors[0].field").value("note"));
  }

  private ResultActions fetch(String path) throws Exception {
    return perform(get("/api/test/problems" + path));
  }

  @Test
  void notFoundIsAProblem() throws Exception {
    isProblem(fetch("/missing"), 404, "Not Found")
        .andExpect(jsonPath("$.detail").value("No such thing"));
  }

  @Test
  void aMalformedPathUuidIs404() throws Exception {
    isProblem(fetch("/things/not-a-uuid"), 404, "Not Found");
  }

  @Test
  void aMalformedQueryUuidIs400() throws Exception {
    isProblem(fetch("/by-id?id=nope"), 400, "Bad Request")
        .andExpect(jsonPath("$.errors[0].field").value("id"))
        .andExpect(jsonPath("$.errors[0].message").value("Invalid value"));
  }

  @Test
  void anUnknownEnumIs400WithItsValues() throws Exception {
    isProblem(fetch("/mood?mood=ASLEEP"), 400, "Bad Request")
        .andExpect(jsonPath("$.errors[0].field").value("mood"))
        .andExpect(jsonPath("$.errors[0].message").value("Must be one of CALM, GRUMPY"));
  }

  @Test
  void unreadableJsonIs400() throws Exception {
    isProblem(postJson("/named", "{not json"), 400, "Bad Request")
        .andExpect(jsonPath("$.errors").doesNotExist());
  }

  @Test
  void anUnknownEnumInABodyIsAFieldError() throws Exception {
    isProblem(postJson("/feeling", "{\"mood\":\"ASLEEP\"}"), 400, "Bad Request")
        .andExpect(jsonPath("$.detail").value("The request has invalid fields"))
        .andExpect(jsonPath("$.errors.length()").value(1))
        .andExpect(jsonPath("$.errors[0].field").value("mood"))
        .andExpect(jsonPath("$.errors[0].message").value("Must be one of CALM, GRUMPY"));
  }

  @Test
  void anUnknownEnumInsideAListNamesTheElement() throws Exception {
    isProblem(
            postJson("/feelings", "{\"feelings\":[{\"mood\":\"CALM\"},{\"mood\":\"ASLEEP\"}]}"),
            400,
            "Bad Request")
        .andExpect(jsonPath("$.errors[0].field").value("feelings[1].mood"))
        .andExpect(jsonPath("$.errors[0].message").value("Must be one of CALM, GRUMPY"));
  }

  @Test
  void aTimeTheServerCannotReadIsAFieldError() throws Exception {
    isProblem(postJson("/schedule", "{\"startsAt\":\"6pm\"}"), 400, "Bad Request")
        .andExpect(jsonPath("$.detail").value("The request has invalid fields"))
        .andExpect(jsonPath("$.errors.length()").value(1))
        .andExpect(jsonPath("$.errors[0].field").value("startsAt"))
        .andExpect(jsonPath("$.errors[0].message").value("Is not in the expected format"));
  }

  @Test
  void aDateOrInstantTheServerCannotReadIsAFieldErrorToo() throws Exception {
    isProblem(postJson("/schedule", "{\"day\":\"2026-02-30\"}"), 400, "Bad Request")
        .andExpect(jsonPath("$.errors[0].field").value("day"))
        .andExpect(jsonPath("$.errors[0].message").value("Is not in the expected format"));
    isProblem(postJson("/schedule", "{\"at\":\"yesterday\"}"), 400, "Bad Request")
        .andExpect(jsonPath("$.errors[0].field").value("at"))
        .andExpect(jsonPath("$.errors[0].message").value("Is not in the expected format"));
  }

  @Test
  void aTimeWithOrWithoutSecondsIsRead() throws Exception {
    postJson("/schedule", "{\"startsAt\":\"18:30\"}").andExpect(status().isOk());
    postJson("/schedule", "{\"startsAt\":\"18:30:00\"}").andExpect(status().isOk());
  }

  @Test
  void aWrongTypeThatIsNotAnEnumStaysGeneric() throws Exception {
    isProblem(postJson("/count", "{\"count\":\"many\"}"), 400, "Bad Request")
        .andExpect(jsonPath("$.errors").doesNotExist());
  }

  @Test
  void aDateOneDayPastTheServersTodayIsAllowedForAFarEasternBrowser() throws Exception {
    postJson("/booking", "{\"day\":\"2026-06-16\",\"phone\":\"+1 (555) 123-4567\"}")
        .andExpect(status().isOk());
  }

  @Test
  void aDateBeyondThatIsNotInTheFutureAndAMalformedPhoneAreFieldErrors() throws Exception {
    isProblem(
            postJson("/booking", "{\"day\":\"2026-06-17\",\"phone\":\"call me\"}"),
            400,
            "Bad Request")
        .andExpect(jsonPath("$.errors.length()").value(2))
        .andExpect(jsonPath("$.errors[0].field").value("day"))
        .andExpect(jsonPath("$.errors[0].message").value("Must not be in the future"))
        .andExpect(jsonPath("$.errors[1].field").value("phone"))
        .andExpect(jsonPath("$.errors[1].message").value("Is not in the expected format"));
  }

  @Test
  void anInvariantViolationIs400WithItsMessageAndNoFields() throws Exception {
    isProblem(fetch("/invariant"), 400, "Bad Request")
        .andExpect(jsonPath("$.detail").value("A class meets at most 7 times a week"))
        .andExpect(jsonPath("$.errors").doesNotExist());
  }

  @Test
  void anInvalidFieldFormatsItsMessageUnderTheField() throws Exception {
    isProblem(fetch("/note"), 400, "Bad Request")
        .andExpect(jsonPath("$.errors[0].field").value("note"))
        .andExpect(jsonPath("$.errors[0].message").value("Must be at most 500 characters"));
  }

  @Test
  void aConstrainedParameterIsAFieldProblem() throws Exception {
    isProblem(fetch("/tag?tag=long"), 400, "Bad Request")
        .andExpect(jsonPath("$.detail").value("The request has invalid fields"))
        .andExpect(jsonPath("$.errors.length()").value(1))
        .andExpect(jsonPath("$.errors[0].field").value("tag"))
        .andExpect(jsonPath("$.errors[0].message").value("Must be between 0 and 3 characters"));
  }

  @Test
  void aBodyBesideAConstrainedParameterNamesItsFields() throws Exception {
    isProblem(postJson("/tagged?tag=long", "{\"name\":\"\"}"), 400, "Bad Request")
        .andExpect(jsonPath("$.errors.length()").value(2))
        .andExpect(jsonPath("$.errors[0].field").value("name"))
        .andExpect(jsonPath("$.errors[0].message").value("Must not be blank"))
        .andExpect(jsonPath("$.errors[1].field").value("tag"));
  }

  @Test
  void aClientThatWentAwayIsAnsweredWithNothing() throws Exception {
    perform(get("/api/test/problems/gone-away"))
        .andExpect(status().isOk())
        .andExpect(content().string(""));
  }

  @Test
  void conflictIs409WithItsMessage() throws Exception {
    isProblem(fetch("/conflict"), 409, "Conflict")
        .andExpect(jsonPath("$.detail").value("The name Ada is taken"));
  }

  @Test
  void staleVersionIs409() throws Exception {
    isProblem(fetch("/stale"), 409, "Conflict")
        .andExpect(jsonPath("$.detail").value("This record changed since you loaded it"));
  }

  @Test
  void integrityViolationIs409WithoutTheDatabaseMessage() throws Exception {
    isProblem(fetch("/duplicate"), 409, "Conflict")
        .andExpect(jsonPath("$.detail").value("This conflicts with existing data"))
        .andExpect(content().string(not(containsString("uq_secret_index"))));
  }

  @Test
  void methodNotAllowedIsAProblem() throws Exception {
    isProblem(perform(delete("/api/test/problems/missing")), 405, "Method Not Allowed");
  }

  @Test
  void aFiveHundredHasAnErrorIdAndLeaksNothing() throws Exception {
    String body =
        isProblem(fetch("/broken"), 500, "Internal Server Error")
            .andExpect(jsonPath("$.detail").value("Something went wrong"))
            .andReturn()
            .getResponse()
            .getContentAsString();
    String errorId = JsonPath.read(body, "$.errorId");
    assertThat(UUID.fromString(errorId)).isNotNull();
    assertThat(body).doesNotContain("hunter2").doesNotContain("IllegalStateException");
  }

  @Test
  void anAnnotatedExceptionKeepsItsStatusAndReason() throws Exception {
    isProblem(fetch("/gone"), 410, "Gone")
        .andExpect(jsonPath("$.detail").value("That has gone"))
        .andExpect(content().string(not(containsString("internal detail"))));
  }

  @Test
  void aMissingPageGoesOnToTheErrorPage() throws Exception {
    // the error page renders the app, which says "Page not found"; a problem would be raw JSON
    perform(get("/no-such-page").accept(MediaType.TEXT_HTML))
        .andExpect(status().isNotFound())
        .andExpect(header().doesNotExist("Content-Type"));
  }

  @Test
  void aMissingApiPathIsAProblem() throws Exception {
    isProblem(perform(get("/api/no-such-thing")), 404, "Not Found");
  }

  @Test
  void aMistypedQueryObjectFieldIsReadable() throws Exception {
    // a query bound as an object: its conversion failures must not name Java types
    isProblem(fetch("/page?pageIndex=abc"), 400, "Bad Request")
        .andExpect(jsonPath("$.errors[0].field").value("pageIndex"))
        .andExpect(jsonPath("$.errors[0].message").value("Invalid value"))
        .andExpect(content().string(not(containsString("java."))));
    isProblem(fetch("/page?sortDirection=SIDEWAYS"), 400, "Bad Request")
        .andExpect(jsonPath("$.errors[0].field").value("sortDirection"))
        .andExpect(jsonPath("$.errors[0].message").value("Must be one of ASC, DESC"))
        .andExpect(content().string(not(containsString("org.jwcarman"))));
  }

  @Test
  void aSizeWithAMinimumSaysSo() throws Exception {
    isProblem(postJson("/code", "{\"code\":\"a\"}"), 400, "Bad Request")
        .andExpect(jsonPath("$.errors[0].message").value("Must be between 2 and 5 characters"));
  }

  @Test
  void aServerErrorAnsweredBySpringIsLoggedWithAnErrorId() throws Exception {
    String body =
        isProblem(fetch("/unwritable"), 500, "Internal Server Error")
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertThat(UUID.fromString(JsonPath.read(body, "$.errorId"))).isNotNull();
  }

  @Test
  void anAnnotatedServerErrorIsLoggedWithAnErrorId() throws Exception {
    String body =
        isProblem(fetch("/unavailable"), 503, "Service Unavailable")
            .andReturn()
            .getResponse()
            .getContentAsString();
    assertThat(UUID.fromString(JsonPath.read(body, "$.errorId"))).isNotNull();
  }

  @Test
  void aDomainRuleOnAFieldIsAFieldProblem() throws Exception {
    // a rule Bean Validation cannot state, thrown by a service, answers like a constraint
    isProblem(fetch("/rule"), 400, "Bad Request")
        .andExpect(jsonPath("$.detail").value("The request has invalid fields"))
        .andExpect(jsonPath("$.errors[0].field").value("dateOfBirth"))
        .andExpect(jsonPath("$.errors[0].message").value("Must not be after today"));
  }

  /** A different API path prefix moves the line between problems and the error page. */
  @Nested
  @TestPropertySource(properties = "roux.problems.api-path-prefix=/rest/")
  class WithACustomApiPathPrefix {

    @Test
    void missingPageOutsideCustomPrefixGoesToErrorPage() throws Exception {
      perform(get("/api/nothing").accept(MediaType.TEXT_HTML))
          .andExpect(status().isNotFound())
          .andExpect(header().doesNotExist("Content-Type"));
    }

    @Test
    void missingApiResourceUnderCustomPrefixIsProblem() throws Exception {
      isProblem(perform(get("/rest/nothing")), 404, "Not Found");
    }
  }
}
