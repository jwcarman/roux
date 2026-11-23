package org.jwcarman.roux.examples.dojo.acceptance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.test.AppTest;
import org.jwcarman.roux.test.TestUser;
import org.jwcarman.roux.test.TestUsers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import com.jayway.jsonpath.JsonPath;

/** The eval's hidden check of the Events contract in the case's prompt; the agent never sees it. */
@AppTest
class EventsAcceptanceTest {

  @Autowired TestUsers users;

  private TestUser owner;
  private String tag;

  @BeforeEach
  void setUp() {
    users.reset();
    owner = users.owner();
    tag = UUID.randomUUID().toString().substring(0, 8);
  }

  @Test
  void theOwnerAddsAnEventAndSeesItListed() throws Exception {
    create("Grading " + tag, "2031-03-01", "2031-03-02")
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.id").isNotEmpty())
        .andExpect(jsonPath("$.name").value("Grading " + tag))
        .andExpect(jsonPath("$.startDate").value("2031-03-01"))
        .andExpect(jsonPath("$.endDate").value("2031-03-02"))
        .andExpect(jsonPath("$.version").isNumber());

    owner
        .perform(get("/api/events"))
        .andExpect(status().isOk())
        .andExpect(
            jsonPath("$[?(@.name == 'Grading %s')].startDate".formatted(tag)).value("2031-03-01"));
  }

  @Test
  void theListIsSoonestFirst() throws Exception {
    create("Later " + tag, "2032-06-10", "2032-06-12").andExpect(status().isCreated());
    create("Sooner " + tag, "2032-01-05", "2032-01-06").andExpect(status().isCreated());
    create("Middle " + tag, "2032-03-20", "2032-03-21").andExpect(status().isCreated());

    String body = owner.perform(get("/api/events")).andReturn().getResponse().getContentAsString();
    List<String> names = JsonPath.read(body, "$[*].name");
    assertThat(names).containsSubsequence("Sooner " + tag, "Middle " + tag, "Later " + tag);
  }

  @Test
  void theOwnerEditsAnEvent() throws Exception {
    String created =
        create("Camp " + tag, "2031-07-01", "2031-07-05")
            .andReturn()
            .getResponse()
            .getContentAsString();
    String id = JsonPath.read(created, "$.id");
    Number version = JsonPath.read(created, "$.version");

    owner
        .perform(
            put("/api/events/" + id)
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"name\":\"Summer camp %s\",\"startDate\":\"2031-07-02\",\"endDate\":\"2031-07-09\",\"version\":%s}"
                        .formatted(tag, version)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").value("Summer camp " + tag))
        .andExpect(jsonPath("$.startDate").value("2031-07-02"))
        .andExpect(jsonPath("$.endDate").value("2031-07-09"));

    owner
        .perform(get("/api/events"))
        .andExpect(jsonPath("$[?(@.id == '%s')].name".formatted(id)).value("Summer camp " + tag));
  }

  @Test
  void aBlankNameIsRefusedOnTheNameField() throws Exception {
    create("   ", "2031-03-01", "2031-03-02")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[?(@.field == 'name')]").isNotEmpty());
  }

  @Test
  void aNameOfSixtyCharactersIsTakenAndSixtyOneIsRefused() throws Exception {
    String sixty = (tag + "x".repeat(60)).substring(0, 60);
    create(sixty, "2031-03-01", "2031-03-02").andExpect(status().isCreated());
    create(sixty + "y", "2031-03-01", "2031-03-02")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[?(@.field == 'name')]").isNotEmpty());
  }

  @Test
  void anEndBeforeTheStartIsRefusedOnTheEndDate() throws Exception {
    create("Backwards " + tag, "2031-03-05", "2031-03-01")
        .andExpect(status().isBadRequest())
        .andExpect(
            jsonPath("$.errors[?(@.field == 'endDate')].message")
                .value("Must be after the start date"));
  }

  @Test
  void anEndOnTheStartIsRefusedOnTheEndDate() throws Exception {
    create("Same day " + tag, "2031-03-05", "2031-03-05")
        .andExpect(status().isBadRequest())
        .andExpect(
            jsonPath("$.errors[?(@.field == 'endDate')].message")
                .value("Must be after the start date"));
  }

  @Test
  void someoneWhoIsNotTheOwnerCannotListEvents() throws Exception {
    instructor().perform(get("/api/events")).andExpect(status().isForbidden());
  }

  @Test
  void someoneWhoIsNotTheOwnerCannotAddAnEvent() throws Exception {
    instructor()
        .perform(
            post("/api/events")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"name\":\"Sneaky %s\",\"startDate\":\"2031-03-01\",\"endDate\":\"2031-03-02\"}"
                        .formatted(tag)))
        .andExpect(status().isForbidden());
  }

  /** The dojo's most trusted role after the owner. */
  private TestUser instructor() {
    return users.signedIn("Ian Instructor", "ian-" + tag + "@example.test", "INSTRUCTOR");
  }

  private ResultActions create(String name, String startDate, String endDate) throws Exception {
    return owner.perform(
        post("/api/events")
            .contentType(MediaType.APPLICATION_JSON)
            .content(
                "{\"name\":\"%s\",\"startDate\":\"%s\",\"endDate\":\"%s\"}"
                    .formatted(name, startDate, endDate)));
  }
}
