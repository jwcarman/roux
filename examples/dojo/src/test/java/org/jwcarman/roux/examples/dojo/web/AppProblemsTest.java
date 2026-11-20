package org.jwcarman.roux.examples.dojo.web;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.examples.dojo.identity.Roles;
import org.jwcarman.roux.test.AppTest;
import org.jwcarman.roux.test.TestMember;
import org.jwcarman.roux.test.TestMembers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

/** The app's own endpoints answer their errors through roux's Problem Details advice. */
@AppTest
class AppProblemsTest {

  @Autowired TestMembers members;

  private TestMember browser;

  @BeforeEach
  void signIn() {
    members.reset();
    browser = members.signedIn("Tess Tester", "tester@example.com", Roles.MEMBER);
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
  void renameWithBlankNameIsAFieldProblem() throws Exception {
    isProblem(
            browser.perform(
                put("/api/members/me")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"displayName\":\" \",\"version\":0}")),
            400,
            "Bad Request")
        .andExpect(jsonPath("$.errors[0].field").value("displayName"));
  }

  @Test
  void aMissingFileGoesOnToTheErrorPage() throws Exception {
    // A page URL gets the shell (roux's SPA filter); a missing file, which has an extension,
    // reaches the error page, which renders the app, which says "Page not found"
    browser
        .perform(get("/no-such-page.html").accept(MediaType.TEXT_HTML))
        .andExpect(status().isNotFound())
        .andExpect(header().doesNotExist("Content-Type"));
  }

  @Test
  void aMissingApiPathIsAProblem() throws Exception {
    isProblem(browser.perform(get("/api/no-such-thing")), 404, "Not Found");
  }

  @Test
  void aMistypedQueryObjectFieldIsReadable() throws Exception {
    // PageParams is bound as an object: its conversion failures must not name Java types
    isProblem(browser.perform(get("/api/members?pageIndex=abc")), 400, "Bad Request")
        .andExpect(jsonPath("$.errors[0].field").value("pageIndex"))
        .andExpect(jsonPath("$.errors[0].message").value("Invalid value"))
        .andExpect(content().string(not(containsString("java."))));
    isProblem(browser.perform(get("/api/members?sortDirection=SIDEWAYS")), 400, "Bad Request")
        .andExpect(jsonPath("$.errors[0].field").value("sortDirection"))
        .andExpect(jsonPath("$.errors[0].message").value("Must be one of ASC, DESC"))
        .andExpect(content().string(not(containsString("org.jwcarman"))));
  }
}
