package org.jwcarman.roux.examples.dojo.ranks;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.examples.dojo.identity.Roles;
import org.jwcarman.roux.test.AppTest;
import org.jwcarman.roux.test.TestUser;
import org.jwcarman.roux.test.TestUsers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@AppTest
class RanksControllerTest {

  private static final String RANKS = "/api/ranks";

  @Autowired TestUsers users;
  @Autowired ObjectMapper json;

  private TestUser owner;

  @BeforeEach
  void cleanSlate() {
    users.reset("rank");
    owner = users.owner();
  }

  @Test
  void ranksAreAddedAtTheTopOfTheLadder() throws Exception {
    create("White", "WHITE");
    create("Yellow", "YELLOW");

    owner
        .perform(get(RANKS))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[*].name", contains("White", "Yellow")))
        .andExpect(jsonPath("$[*].position", contains(1, 2)));
  }

  @Test
  void aNameAnotherRankHasIsRefusedUnderName() throws Exception {
    create("Black Belt", "BLACK");

    owner
        .perform(send(post(RANKS), " black belt ", "BLACK", null))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("name"))
        .andExpect(jsonPath("$.errors[0].message").value("Another rank has this name"));
  }

  @Test
  void aRankKeepsItsOwnNameWhenRecoloured() throws Exception {
    JsonNode white = create("White", "WHITE");

    owner
        .perform(send(put(RANKS + "/" + id(white)), "White", "YELLOW", 0L))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.colour").value("YELLOW"))
        .andExpect(jsonPath("$.version").value(1));
  }

  @Test
  void theRequestsRulesAreChecked() throws Exception {
    owner
        .perform(send(post(RANKS), "x".repeat(41), null, null))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors", hasSize(2)));
  }

  @Test
  void aStaleVersionIs409() throws Exception {
    JsonNode white = create("White", "WHITE");
    owner
        .perform(send(put(RANKS + "/" + id(white)), "Snow", "WHITE", 0L))
        .andExpect(status().isOk());

    owner
        .perform(send(put(RANKS + "/" + id(white)), "Ivory", "WHITE", 0L))
        .andExpect(status().isConflict());
  }

  @Test
  void movingSwapsWithTheNeighbourAndRefusesAtTheEnds() throws Exception {
    JsonNode white = create("White", "WHITE");
    JsonNode yellow = create("Yellow", "YELLOW");

    owner
        .perform(post(RANKS + "/" + id(white) + "/move-up"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[*].name", contains("Yellow", "White")));
    owner
        .perform(post(RANKS + "/" + id(white) + "/move-up"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.detail").value("White is already the highest rank"));
    owner
        .perform(post(RANKS + "/" + id(yellow) + "/move-down"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.detail").value("Yellow is already the lowest rank"));
  }

  @Test
  void removingCloseTheGap() throws Exception {
    create("White", "WHITE");
    JsonNode yellow = create("Yellow", "YELLOW");
    create("Green", "GREEN");

    owner.perform(delete(RANKS + "/" + id(yellow))).andExpect(status().isNoContent());

    owner
        .perform(get(RANKS))
        .andExpect(jsonPath("$[*].name", contains("White", "Green")))
        .andExpect(jsonPath("$[*].position", contains(1, 2)));
  }

  @Test
  void anUnknownRankIs404() throws Exception {
    owner
        .perform(delete(RANKS + "/00000000-0000-0000-0000-000000000000"))
        .andExpect(status().isNotFound());
  }

  @Test
  void aMemberReadsButCannotChange() throws Exception {
    JsonNode white = create("White", "WHITE");
    TestUser ada = users.signedIn("Ada", "ada@example.org", Roles.MEMBER);

    ada.perform(get(RANKS)).andExpect(status().isOk());
    for (MockHttpServletRequestBuilder write :
        List.of(
            send(post(RANKS), "Yellow", "YELLOW", null),
            send(put(RANKS + "/" + id(white)), "Snow", "WHITE", 0L),
            post(RANKS + "/" + id(white) + "/move-up"),
            post(RANKS + "/" + id(white) + "/move-down"),
            delete(RANKS + "/" + id(white)))) {
      ada.perform(write).andExpect(status().isForbidden());
    }
  }

  @Test
  void signedOutIs401() throws Exception {
    users.anonymous().perform(get(RANKS)).andExpect(status().isUnauthorized());
  }

  private JsonNode create(String name, String colour) throws Exception {
    MvcResult result =
        owner
            .perform(send(post(RANKS), name, colour, null))
            .andExpect(status().isCreated())
            .andReturn();
    return json.readTree(result.getResponse().getContentAsString());
  }

  private static String id(JsonNode rank) {
    return rank.get("id").asString();
  }

  private MockHttpServletRequestBuilder send(
      MockHttpServletRequestBuilder request, String name, String colour, Long version) {
    return request
        .contentType(MediaType.APPLICATION_JSON)
        .content(json.writeValueAsString(new Body(name, colour, version)));
  }

  private record Body(String name, String colour, Long version) {}
}
