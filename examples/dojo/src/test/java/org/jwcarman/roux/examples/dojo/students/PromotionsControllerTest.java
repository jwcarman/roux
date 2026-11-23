package org.jwcarman.roux.examples.dojo.students;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.examples.dojo.identity.Roles;
import org.jwcarman.roux.test.AppTest;
import org.jwcarman.roux.test.TestClock;
import org.jwcarman.roux.test.TestUser;
import org.jwcarman.roux.test.TestUsers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@AppTest
class PromotionsControllerTest {

  private static final String STUDENTS = "/api/students";
  private static final String RANKS = "/api/ranks";

  @Autowired TestUsers users;
  @Autowired TestClock clock;
  @Autowired ObjectMapper json;
  @Autowired JdbcTemplate jdbc;

  private TestUser owner;
  private String white;
  private String yellow;
  private String green;

  @BeforeEach
  void cleanSlate() throws Exception {
    users.reset();
    owner = users.owner();
    white = rank("White", "WHITE");
    yellow = rank("Yellow", "YELLOW");
    green = rank("Green", "GREEN");
  }

  @Test
  void aStudentsPageShowsTheirDetailAndNoRankUntilPromoted() throws Exception {
    String ada = student("Ada", "Lovelace");

    owner
        .perform(get(STUDENTS + "/" + ada))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.firstName").value("Ada"))
        .andExpect(jsonPath("$.currentRank").value(nullValue()))
        .andExpect(jsonPath("$.promotions", hasSize(0)));
  }

  @Test
  void aPromotionSetsTheCurrentRankAndIsListedNewestFirst() throws Exception {
    String ada = student("Ada", "Lovelace");

    promote(ada, white, "2026-01-10");
    owner
        .perform(promotion(ada, yellow, "2026-03-10"))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.currentRank.name").value("Yellow"))
        .andExpect(jsonPath("$.promotions[*].rank.name", contains("Yellow", "White")))
        .andExpect(jsonPath("$.promotions[*].date", contains("2026-03-10", "2026-01-10")));
  }

  @Test
  void aPromotionDatedBeforeAnExistingOneDoesNotChangeTheCurrentRank() throws Exception {
    String ada = student("Ada", "Lovelace");
    promote(ada, yellow, "2026-03-10");

    owner
        .perform(promotion(ada, white, "2025-12-01"))
        .andExpect(jsonPath("$.currentRank.name").value("Yellow"))
        .andExpect(jsonPath("$.promotions[*].rank.name", contains("Yellow", "White")));
  }

  @Test
  void whenTwoPromotionsShareADateTheLatestRecordedIsCurrent() throws Exception {
    String ada = student("Ada", "Lovelace");
    clock.set("2026-03-10T10:00:00Z");
    promote(ada, white, "2026-03-10");
    clock.advance(Duration.ofMinutes(1));

    owner
        .perform(promotion(ada, yellow, "2026-03-10"))
        .andExpect(jsonPath("$.currentRank.name").value("Yellow"))
        .andExpect(jsonPath("$.promotions[*].rank.name", contains("Yellow", "White")));
  }

  @Test
  void twoStudentsPromotedOnTheSameDayEachHoldTheirOwnRank() throws Exception {
    String ada = student("Ada", "Lovelace");
    String alan = student("Alan", "Turing");

    promote(ada, white, "2026-03-10");
    promote(alan, yellow, "2026-03-10");

    owner
        .perform(get(STUDENTS + "/" + ada))
        .andExpect(jsonPath("$.currentRank.name").value("White"));
    owner
        .perform(get(STUDENTS + "/" + alan))
        .andExpect(jsonPath("$.currentRank.name").value("Yellow"));
  }

  @Test
  void removingAPromotionRecomputesTheCurrentRank() throws Exception {
    String ada = student("Ada", "Lovelace");
    promote(ada, white, "2026-01-10");
    JsonNode promoted = promote(ada, yellow, "2026-03-10");
    String yellowPromotion = promoted.get("promotions").get(0).get("id").asString();

    owner
        .perform(delete(STUDENTS + "/" + ada + "/promotions/" + yellowPromotion))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.currentRank.name").value("White"))
        .andExpect(jsonPath("$.promotions", hasSize(1)));

    String whitePromotion =
        json.readTree(
                owner
                    .perform(get(STUDENTS + "/" + ada))
                    .andReturn()
                    .getResponse()
                    .getContentAsString())
            .get("promotions")
            .get(0)
            .get("id")
            .asString();
    owner
        .perform(delete(STUDENTS + "/" + ada + "/promotions/" + whitePromotion))
        .andExpect(jsonPath("$.currentRank").value(nullValue()));
  }

  @Test
  void theListSortsByCurrentRankWithUnpromotedStudentsLastEitherWay() throws Exception {
    String ada = student("Ada", "Lovelace");
    String alan = student("Alan", "Turing");
    student("Grace", "Hopper");
    promote(ada, green, "2026-03-10");
    promote(alan, white, "2026-03-10");

    assertNames("RANK", "ASC", "Alan", "Ada", "Grace");
    assertNames("RANK", "DESC", "Ada", "Alan", "Grace");
  }

  @Test
  void theListFiltersByCurrentRankNotByRanksHeldBefore() throws Exception {
    String ada = student("Ada", "Lovelace");
    String alan = student("Alan", "Turing");
    promote(ada, white, "2026-01-10");
    promote(ada, yellow, "2026-03-10");
    promote(alan, white, "2026-03-10");

    owner
        .perform(get(STUDENTS).param("rankId", white))
        .andExpect(jsonPath("$.data[*].firstName", contains("Alan")));
    owner
        .perform(get(STUDENTS).param("rankId", yellow))
        .andExpect(jsonPath("$.data[*].firstName", contains("Ada")))
        .andExpect(jsonPath("$.data[0].currentRank.name").value("Yellow"));
  }

  @Test
  void aRankAStudentHoldsOrHasHeldCannotBeRemoved() throws Exception {
    String ada = student("Ada", "Lovelace");
    promote(ada, white, "2026-01-10");
    JsonNode promoted = promote(ada, yellow, "2026-03-10");

    owner
        .perform(delete(RANKS + "/" + white))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.detail").value("Students hold or have held White"));
    owner
        .perform(get(RANKS))
        .andExpect(jsonPath("$[*].name", contains("White", "Yellow", "Green")));

    // taking the promotion back frees the rank
    owner
        .perform(
            delete(
                STUDENTS
                    + "/"
                    + ada
                    + "/promotions/"
                    + promoted.get("promotions").get(1).get("id").asString()))
        .andExpect(status().isOk());
    owner.perform(delete(RANKS + "/" + white)).andExpect(status().isNoContent());
  }

  @Test
  void aRankNoStudentHoldsCanBeRemoved() throws Exception {
    owner.perform(delete(RANKS + "/" + green)).andExpect(status().isNoContent());
  }

  @Test
  void anUnknownStudentIs404() throws Exception {
    UUID missing = UUID.randomUUID();

    owner
        .perform(get(STUDENTS + "/" + missing))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.detail").value("No student " + missing));
    owner
        .perform(promotion(missing.toString(), white, "2026-01-10"))
        .andExpect(status().isNotFound());
    owner
        .perform(delete(STUDENTS + "/" + missing + "/promotions/" + UUID.randomUUID()))
        .andExpect(status().isNotFound());
  }

  @Test
  void aPromotionOfAnotherStudentIs404() throws Exception {
    String ada = student("Ada", "Lovelace");
    String alan = student("Alan", "Turing");
    JsonNode promoted = promote(ada, white, "2026-01-10");
    String id = promoted.get("promotions").get(0).get("id").asString();

    owner
        .perform(delete(STUDENTS + "/" + alan + "/promotions/" + id))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.detail").value("No promotion " + id));
    owner.perform(get(STUDENTS + "/" + ada)).andExpect(jsonPath("$.promotions", hasSize(1)));
  }

  @Test
  void aPromotionToAnUnknownRankIs400OnRankId() throws Exception {
    String ada = student("Ada", "Lovelace");

    owner
        .perform(promotion(ada, UUID.randomUUID().toString(), "2026-01-10"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("rankId"))
        .andExpect(jsonPath("$.errors[0].message").value("No such rank"));
  }

  @Test
  void tomorrowIs400OnDateButTheSchoolsTodayIsFine() throws Exception {
    String ada = student("Ada", "Lovelace");
    // 03:00 UTC on Mar 11 is still Mar 10 in New York, the school's zone.
    clock.set("2026-03-11T03:00:00Z");
    owner = users.owner();

    owner.perform(promotion(ada, white, "2026-03-10")).andExpect(status().isCreated());
    owner
        .perform(promotion(ada, green, "2026-03-11"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("date"))
        .andExpect(jsonPath("$.errors[0].message").value("Must not be in the future"));
  }

  @Test
  void theSamePromotionOnTheSameDayTwiceIs409() throws Exception {
    String ada = student("Ada", "Lovelace");
    promote(ada, white, "2026-03-10");

    owner
        .perform(promotion(ada, white, "2026-03-10"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.detail").value("Ada Lovelace already holds White from that date"));
    // another day, or another rank, is a promotion of its own
    owner.perform(promotion(ada, white, "2026-03-11")).andExpect(status().isCreated());
    owner.perform(promotion(ada, yellow, "2026-03-10")).andExpect(status().isCreated());
  }

  @Test
  void aMissingRankOrDateIs400() throws Exception {
    String ada = student("Ada", "Lovelace");
    Map<String, Object> body = new LinkedHashMap<>();

    owner
        .perform(
            post(STUDENTS + "/" + ada + "/promotions")
                .contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(body)))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors", hasSize(2)))
        .andExpect(jsonPath("$.errors[?(@.field == 'rankId')].message").value("Must not be empty"))
        .andExpect(jsonPath("$.errors[?(@.field == 'date')].message").value("Must not be empty"));
  }

  @Test
  void aMemberReadsAStudentButCannotPromote() throws Exception {
    String ada = student("Ada", "Lovelace");
    JsonNode promoted = promote(ada, white, "2026-01-10");
    String id = promoted.get("promotions").get(0).get("id").asString();
    TestUser grace = users.signedIn("Grace", "grace@example.org", Roles.MEMBER);

    grace.perform(get(STUDENTS + "/" + ada)).andExpect(status().isOk());
    for (MockHttpServletRequestBuilder write :
        List.of(
            promotion(ada, yellow, "2026-02-01"),
            delete(STUDENTS + "/" + ada + "/promotions/" + id))) {
      grace.perform(write).andExpect(status().isForbidden());
    }
  }

  @Test
  void signedOutIs401() throws Exception {
    users
        .anonymous()
        .perform(get(STUDENTS + "/" + UUID.randomUUID()))
        .andExpect(status().isUnauthorized());
  }

  private void assertNames(String sortBy, String direction, String... names) throws Exception {
    owner
        .perform(get(STUDENTS).param("sortBy", sortBy).param("sortDirection", direction))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data[*].firstName", contains((Object[]) names)));
  }

  private String rank(String name, String colour) throws Exception {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("name", name);
    body.put("colour", colour);
    return idOf(
        owner
            .perform(
                post(RANKS)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json.writeValueAsString(body)))
            .andExpect(status().isCreated())
            .andReturn());
  }

  private String student(String firstName, String lastName) throws Exception {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("firstName", firstName);
    body.put("lastName", lastName);
    body.put("startDate", "2026-01-01");
    return idOf(
        owner
            .perform(
                post(STUDENTS)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(json.writeValueAsString(body)))
            .andExpect(status().isCreated())
            .andReturn());
  }

  @Test
  void aPromotionIsInTheStudentsHistoryAndTheRanks() throws Exception {
    String ada = student("Ada", "Lovelace");
    promote(ada, yellow, "2026-03-01");

    owner
        .perform(get(STUDENTS + "/" + ada + "/activities"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data[0].type").value("student.promoted"))
        .andExpect(jsonPath("$.data[0].description").value("Promoted to Yellow"))
        .andExpect(jsonPath("$.data[0].details.rankId").value(yellow))
        .andExpect(jsonPath("$.data[0].details.on").value("2026-03-01"));
    assertThat(
            jdbc.queryForList(
                "select description from roux_activity where ?::uuid = any(related_ids)",
                String.class,
                yellow))
        .containsExactly("Promoted to Yellow");
  }

  @Test
  void takingAPromotionBackIsInTheStudentsHistory() throws Exception {
    String ada = student("Ada", "Lovelace");
    String promotionId =
        promote(ada, yellow, "2026-03-01").get("promotions").get(0).get("id").asString();
    owner
        .perform(delete(STUDENTS + "/" + ada + "/promotions/" + promotionId))
        .andExpect(status().isOk());

    owner
        .perform(get(STUDENTS + "/" + ada + "/activities"))
        .andExpect(jsonPath("$.data[0].type").value("promotion.removed"))
        .andExpect(jsonPath("$.data[0].description").value("Promotion to Yellow taken back"))
        .andExpect(jsonPath("$.data[1].type").value("student.promoted"));
  }

  private JsonNode promote(String studentId, String rankId, String date) throws Exception {
    MvcResult result =
        owner
            .perform(promotion(studentId, rankId, date))
            .andExpect(status().isCreated())
            .andReturn();
    return json.readTree(result.getResponse().getContentAsString());
  }

  private MockHttpServletRequestBuilder promotion(String studentId, String rankId, String date) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("rankId", rankId);
    body.put("date", date);
    return post(STUDENTS + "/" + studentId + "/promotions")
        .contentType(MediaType.APPLICATION_JSON)
        .content(json.writeValueAsString(body));
  }

  private String idOf(MvcResult result) throws Exception {
    return json.readTree(result.getResponse().getContentAsString()).get("id").asString();
  }
}
