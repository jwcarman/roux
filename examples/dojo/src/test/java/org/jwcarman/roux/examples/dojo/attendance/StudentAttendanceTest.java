package org.jwcarman.roux.examples.dojo.attendance;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.sql.Timestamp;
import java.time.Duration;
import java.util.LinkedHashMap;
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

import tools.jackson.databind.ObjectMapper;

/**
 * A student's attendance on their page: the history, and the classes since their last promotion.
 */
@AppTest
class StudentAttendanceTest {

  private static final String STUDENTS = "/api/students";

  @Autowired TestUsers users;
  @Autowired TestClock clock;
  @Autowired ObjectMapper json;
  @Autowired JdbcTemplate jdbc;

  private TestUser owner;
  private String kids;
  private String adults;
  private String ada;
  private String alan;
  private String white;
  private String yellow;

  @BeforeEach
  void cleanSlate() throws Exception {
    users.reset();
    owner = users.owner();
    clock.set("2026-03-20T10:00:00Z");
    kids = schoolClass("Kids", "MONDAY");
    adults = schoolClass("Adults", "TUESDAY");
    ada = student("Ada", "Lovelace");
    alan = student("Alan", "Turing");
    white = rank("White", "WHITE");
    yellow = rank("Yellow", "YELLOW");
  }

  @Test
  void aStudentNeverPromotedHasAllTheirClassesSincePromotion() throws Exception {
    attend(ada, kids, "2026-03-02");
    attend(ada, adults, "2026-03-03");

    owner
        .perform(get(sinceUrl(ada)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.classes").value(2))
        .andExpect(jsonPath("$.promotedOn").value(nullValue()));
  }

  @Test
  void aStudentWithNoAttendanceHasNone() throws Exception {
    owner.perform(get(sinceUrl(ada))).andExpect(jsonPath("$.classes").value(0));
    owner
        .perform(get(listUrl(ada)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data", hasSize(0)))
        .andExpect(jsonPath("$.pagination.hasNext").value(false));
  }

  @Test
  void onlyClassesAfterTheCurrentRanksDateCountAndThatDatesOwnClassDoesNot() throws Exception {
    attend(ada, kids, "2026-02-23");
    attend(ada, kids, "2026-03-02");
    promote(ada, white, "2026-03-09");
    attend(ada, kids, "2026-03-09");
    attend(ada, kids, "2026-03-16");
    attend(ada, adults, "2026-03-10");

    owner
        .perform(get(sinceUrl(ada)))
        .andExpect(jsonPath("$.classes").value(2))
        .andExpect(jsonPath("$.promotedOn").value("2026-03-09"));
  }

  @Test
  void attendanceTheSameDayAsAPromotionIsNotCountedAndTheNextDaysIs() throws Exception {
    promote(ada, white, "2026-03-10");
    attend(ada, adults, "2026-03-10");

    owner.perform(get(sinceUrl(ada))).andExpect(jsonPath("$.classes").value(0));

    attend(ada, adults, "2026-03-17");
    owner.perform(get(sinceUrl(ada))).andExpect(jsonPath("$.classes").value(1));
  }

  @Test
  void aSecondPromotionRestartsTheCountAtItsDate() throws Exception {
    promote(ada, white, "2026-02-02");
    attend(ada, kids, "2026-02-09");
    attend(ada, kids, "2026-02-16");
    promote(ada, yellow, "2026-03-02");
    attend(ada, kids, "2026-03-09");

    owner
        .perform(get(sinceUrl(ada)))
        .andExpect(jsonPath("$.classes").value(1))
        .andExpect(jsonPath("$.promotedOn").value("2026-03-02"));
  }

  @Test
  void aPromotionDatedBeforeTheCurrentOneChangesNothingAndTakingTheCurrentOneBackMovesTheDate()
      throws Exception {
    promote(ada, yellow, "2026-03-02");
    attend(ada, kids, "2026-02-23");
    attend(ada, kids, "2026-03-09");
    promote(ada, white, "2026-02-16");

    owner
        .perform(get(sinceUrl(ada)))
        .andExpect(jsonPath("$.classes").value(1))
        .andExpect(jsonPath("$.promotedOn").value("2026-03-02"));

    String yellowPromotion = idOfPromotion(ada, "Yellow");
    owner.perform(delete(STUDENTS + "/" + ada + "/promotions/" + yellowPromotion));

    owner
        .perform(get(sinceUrl(ada)))
        .andExpect(jsonPath("$.classes").value(2))
        .andExpect(jsonPath("$.promotedOn").value("2026-02-16"));
  }

  @Test
  void onlyTheStudentsOwnAttendanceCounts() throws Exception {
    attend(ada, kids, "2026-03-02");
    attend(alan, kids, "2026-03-02");
    attend(alan, kids, "2026-03-09");

    owner.perform(get(sinceUrl(ada))).andExpect(jsonPath("$.classes").value(1));
    owner.perform(get(sinceUrl(alan))).andExpect(jsonPath("$.classes").value(2));
    owner.perform(get(listUrl(ada))).andExpect(jsonPath("$.data", hasSize(1)));
  }

  @Test
  void theHistoryIsNewestFirstWithTheClassName() throws Exception {
    attend(ada, kids, "2026-03-02");
    attend(ada, adults, "2026-03-10");
    attend(ada, kids, "2026-03-09");

    owner
        .perform(get(listUrl(ada)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data[*].date", contains("2026-03-10", "2026-03-09", "2026-03-02")))
        .andExpect(jsonPath("$.data[*].className", contains("Adults", "Kids", "Kids")))
        .andExpect(jsonPath("$.data[0].classId").value(adults));
  }

  @Test
  void twoClassesOnOneDayListTheLatestRecordedFirst() throws Exception {
    String evening = schoolClass("Evening", "MONDAY");
    clock.set("2026-03-09T10:00:00Z");
    attend(ada, kids, "2026-03-09");
    clock.advance(Duration.ofMinutes(5));
    attend(ada, evening, "2026-03-09");

    owner
        .perform(get(listUrl(ada)))
        .andExpect(jsonPath("$.data[*].className", contains("Evening", "Kids")));
  }

  @Test
  void theHistoryPagesAndAskingForADifferentSortChangesNothing() throws Exception {
    attend(ada, kids, "2026-03-02");
    attend(ada, kids, "2026-03-09");
    attend(ada, kids, "2026-03-16");

    owner
        .perform(get(listUrl(ada)).param("pageSize", "2"))
        .andExpect(jsonPath("$.data[*].date", contains("2026-03-16", "2026-03-09")))
        .andExpect(jsonPath("$.pagination.hasNext").value(true))
        .andExpect(jsonPath("$.pagination.totalElementCount").value(3));
    owner
        .perform(get(listUrl(ada)).param("pageSize", "2").param("pageIndex", "1"))
        .andExpect(jsonPath("$.data[*].date", contains("2026-03-02")))
        .andExpect(jsonPath("$.pagination.hasNext").value(false));
    owner
        .perform(get(listUrl(ada)).param("sortDirection", "ASC"))
        .andExpect(jsonPath("$.data[0].date").value("2026-03-16"));
  }

  @Test
  void aDeactivatedStudentKeepsTheirHistoryAndCount() throws Exception {
    attend(ada, kids, "2026-03-02");
    attend(ada, kids, "2026-03-09");
    owner.perform(post(STUDENTS + "/" + ada + "/deactivate")).andExpect(status().isOk());

    owner
        .perform(get(listUrl(ada)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data", hasSize(2)));
    owner.perform(get(sinceUrl(ada))).andExpect(jsonPath("$.classes").value(2));
  }

  @Test
  void anUnknownStudentIs404() throws Exception {
    UUID missing = UUID.randomUUID();

    owner
        .perform(get(listUrl(missing.toString())))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.detail").value("No student " + missing));
    owner.perform(get(sinceUrl(missing.toString()))).andExpect(status().isNotFound());
  }

  @Test
  void everyoneSignedInReadsItAndSignedOutIs401() throws Exception {
    TestUser mo = users.signedIn("Mo", "mo@example.org", Roles.MEMBER);
    TestUser ivy = users.signedIn("Ivy", "ivy@example.org", Roles.INSTRUCTOR);
    attend(ada, kids, "2026-03-02");

    for (TestUser reader : new TestUser[] {mo, ivy}) {
      reader.perform(get(listUrl(ada))).andExpect(jsonPath("$.data", hasSize(1)));
      reader.perform(get(sinceUrl(ada))).andExpect(jsonPath("$.classes").value(1));
    }
    users.anonymous().perform(get(listUrl(ada))).andExpect(status().isUnauthorized());
  }

  private static String listUrl(String studentId) {
    return STUDENTS + "/" + studentId + "/attendance";
  }

  private static String sinceUrl(String studentId) {
    return listUrl(studentId) + "/since-promotion";
  }

  /** Records attendance directly: these tests are about counting, not about the weekday rule. */
  private void attend(String studentId, String classId, String date) {
    jdbc.update(
        "insert into attendance (id, version, class_id, student_id, attended_on, created_date)"
            + " values (gen_random_uuid(), 0, ?::uuid, ?::uuid, ?::date, ?)",
        classId,
        studentId,
        date,
        Timestamp.from(clock.instant()));
  }

  private void promote(String studentId, String rankId, String date) throws Exception {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("rankId", rankId);
    body.put("date", date);
    clock.advance(Duration.ofSeconds(1));
    owner
        .perform(send(post(STUDENTS + "/" + studentId + "/promotions"), body))
        .andExpect(status().isCreated());
  }

  private String idOfPromotion(String studentId, String rankName) throws Exception {
    MvcResult result = owner.perform(get(STUDENTS + "/" + studentId)).andReturn();
    for (var promotion :
        json.readTree(result.getResponse().getContentAsString()).get("promotions")) {
      if (rankName.equals(promotion.get("rank").get("name").asString())) {
        return promotion.get("id").asString();
      }
    }
    throw new AssertionError("no promotion to " + rankName);
  }

  private String schoolClass(String name, String weekday) throws Exception {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("name", name);
    body.put("weekday", weekday);
    body.put("startsAt", "17:00");
    body.put("endsAt", "18:00");
    return idOf(owner.perform(send(post("/api/classes"), body)).andReturn());
  }

  private String student(String firstName, String lastName) throws Exception {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("firstName", firstName);
    body.put("lastName", lastName);
    body.put("startDate", "2026-01-01");
    return idOf(owner.perform(send(post(STUDENTS), body)).andReturn());
  }

  private String rank(String name, String colour) throws Exception {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("name", name);
    body.put("colour", colour);
    return idOf(owner.perform(send(post("/api/ranks"), body)).andReturn());
  }

  private MockHttpServletRequestBuilder send(
      MockHttpServletRequestBuilder request, Map<String, Object> body) throws Exception {
    return request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
  }

  private String idOf(MvcResult result) throws Exception {
    return json.readTree(result.getResponse().getContentAsString()).get("id").asString();
  }
}
