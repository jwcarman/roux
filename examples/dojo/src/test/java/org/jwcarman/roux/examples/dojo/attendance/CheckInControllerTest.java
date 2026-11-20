package org.jwcarman.roux.examples.dojo.attendance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.examples.dojo.identity.Roles;
import org.jwcarman.roux.test.AppTest;
import org.jwcarman.roux.test.TestClock;
import org.jwcarman.roux.test.TestMember;
import org.jwcarman.roux.test.TestMembers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import tools.jackson.databind.ObjectMapper;

@AppTest
class CheckInControllerTest {

  private static final String CLASSES = "/api/classes";

  /** A Tuesday. */
  private static final String TUESDAY = "2026-03-10";

  @Autowired TestMembers members;
  @Autowired TestClock clock;
  @Autowired ObjectMapper json;
  @Autowired JdbcTemplate jdbc;
  @Autowired AttendanceService service;

  private TestMember owner;
  private String tuesdayClass;
  private String ada;
  private String alan;

  @BeforeEach
  void cleanSlate() throws Exception {
    members.reset("attendance", "school_class", "student");
    owner = members.owner();
    clock.set("2026-03-12T10:00:00Z");
    tuesdayClass = schoolClass("Tuesday Karate", "TUESDAY");
    ada = student("Ada", "Lovelace");
    alan = student("Alan", "Turing");
  }

  @Test
  void theListHasEveryActiveStudentByNameNobodyPresentAtFirst() throws Exception {
    student("grace", "hopper");

    owner
        .perform(checkIn(tuesdayClass, TUESDAY))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[*].firstName", contains("grace", "Ada", "Alan")))
        .andExpect(jsonPath("$[*].present", contains(false, false, false)));
  }

  @Test
  void aStudentMarkedPresentShowsPresentOnThatDateOnly() throws Exception {
    mark(tuesdayClass, ada, TUESDAY, true).andExpect(status().isOk());

    owner
        .perform(checkIn(tuesdayClass, TUESDAY))
        .andExpect(jsonPath("$[?(@.studentId == '" + ada + "')].present").value(true))
        .andExpect(jsonPath("$[?(@.studentId == '" + alan + "')].present").value(false));
    owner
        .perform(checkIn(tuesdayClass, "2026-03-03"))
        .andExpect(jsonPath("$[*].present", contains(false, false)));
  }

  @Test
  void markingPresentAnswersTheStudentAsTheListShowsThem() throws Exception {
    mark(tuesdayClass, ada, TUESDAY, true)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.studentId").value(ada))
        .andExpect(jsonPath("$.firstName").value("Ada"))
        .andExpect(jsonPath("$.present").value(true));
  }

  @Test
  void aRepeatedPresentIsIdempotentAndLeavesOneRow() throws Exception {
    mark(tuesdayClass, ada, TUESDAY, true).andExpect(status().isOk());
    mark(tuesdayClass, ada, TUESDAY, true).andExpect(status().isOk());

    assertThat(rows()).isEqualTo(1);
  }

  @Test
  void takingBackAMarkRemovesItAndTakingBackAgainIsNotAnError() throws Exception {
    mark(tuesdayClass, ada, TUESDAY, true);

    mark(tuesdayClass, ada, TUESDAY, false)
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.present").value(false));
    mark(tuesdayClass, ada, TUESDAY, false).andExpect(status().isOk());

    assertThat(rows()).isZero();
  }

  @Test
  void manyRequestsAtOnceForOneStudentNeverMakeASecondRowOrAnError() throws Exception {
    int threads = 12;
    ExecutorService pool = Executors.newFixedThreadPool(threads);
    CountDownLatch start = new CountDownLatch(1);
    UUID classId = UUID.fromString(tuesdayClass);
    AttendanceRequest present =
        new AttendanceRequest(UUID.fromString(ada), LocalDate.parse(TUESDAY), true);
    try {
      List<Future<Attendee>> answers = new ArrayList<>();
      for (int i = 0; i < threads; i++) {
        answers.add(
            pool.submit(
                () -> {
                  start.await();
                  return service.mark(classId, present);
                }));
      }
      start.countDown();
      for (Future<Attendee> answer : answers) {
        assertThat(answer.get().present()).isTrue();
      }
    } finally {
      pool.shutdownNow();
    }

    assertThat(rows()).isEqualTo(1);
  }

  @Test
  void presentAndNotPresentRacingEndOnOneOrNoRowAndNeverAnError() throws Exception {
    int threads = 12;
    ExecutorService pool = Executors.newFixedThreadPool(threads);
    CountDownLatch start = new CountDownLatch(1);
    UUID classId = UUID.fromString(tuesdayClass);
    try {
      List<Future<Attendee>> answers = new ArrayList<>();
      for (int i = 0; i < threads; i++) {
        AttendanceRequest request =
            new AttendanceRequest(UUID.fromString(ada), LocalDate.parse(TUESDAY), i % 2 == 0);
        answers.add(
            pool.submit(
                () -> {
                  start.await();
                  return service.mark(classId, request);
                }));
      }
      start.countDown();
      for (Future<Attendee> answer : answers) {
        try {
          answer.get();
        } catch (ExecutionException e) {
          throw new AssertionError("a racing request failed", e.getCause());
        }
      }
    } finally {
      pool.shutdownNow();
    }

    assertThat(rows()).isBetween(0, 1);
  }

  @Test
  void theDatabaseRefusesASecondMarkOfTheSameStudentClassAndDate() {
    insert(ada, TUESDAY);

    assertThatThrownBy(() -> insert(ada, TUESDAY))
        .isInstanceOf(DataIntegrityViolationException.class);
    insert(alan, TUESDAY);
    insert(ada, "2026-03-03");
    assertThat(rows()).isEqualTo(3);
  }

  @Test
  void aDateOnTheWrongWeekdayIsAFieldErrorOnDate() throws Exception {
    owner
        .perform(checkIn(tuesdayClass, "2026-03-09"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("date"))
        .andExpect(
            jsonPath("$.errors[0].message").value("Must be a Tuesday, when Tuesday Karate runs"));
    mark(tuesdayClass, ada, "2026-03-09", true)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("date"));
    assertThat(rows()).isZero();
  }

  @Test
  void aDateInTheFutureIsAFieldErrorOnDateForTheListAndForAMark() throws Exception {
    owner
        .perform(checkIn(tuesdayClass, "2026-03-17"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("date"))
        .andExpect(jsonPath("$.errors[0].message").value("Must not be in the future"));
    mark(tuesdayClass, ada, "2026-03-17", true)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("date"))
        .andExpect(jsonPath("$.errors[0].message").value("Must not be in the future"));
    assertThat(rows()).isZero();
  }

  @Test
  void theSchoolsTodayIsAcceptedThoughUtcIsAlreadyTomorrow() throws Exception {
    // 03:00 UTC on Wednesday Mar 11 is still Tuesday Mar 10 in New York, the school's zone.
    clock.set("2026-03-11T03:00:00Z");
    owner = members.owner();
    String tuesdayClass = schoolClass("Tuesday Sparring", "TUESDAY");

    mark(tuesdayClass, ada, "2026-03-10", true).andExpect(status().isOk());
    owner.perform(checkIn(tuesdayClass, "2026-03-10")).andExpect(status().isOk());
    String wednesdayClass = schoolClass("Wednesday Kata", "WEDNESDAY");
    mark(wednesdayClass, ada, "2026-03-11", true)
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("date"));
  }

  @Test
  void aMissingOrUnreadableDateIsAFieldErrorNotA500() throws Exception {
    owner
        .perform(get(CLASSES + "/" + tuesdayClass + "/check-in"))
        .andExpect(status().isBadRequest());
    owner
        .perform(get(CLASSES + "/" + tuesdayClass + "/check-in").param("date", "tuesday"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("date"));
    owner
        .perform(send(put(CLASSES + "/" + tuesdayClass + "/attendance"), new LinkedHashMap<>()))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors", hasSize(3)));
  }

  @Test
  void aDeactivatedStudentIsNotListedAndCannotBeMarkedButKeepsTheirAttendance() throws Exception {
    mark(tuesdayClass, ada, TUESDAY, true);
    owner.perform(post("/api/students/" + ada + "/deactivate")).andExpect(status().isOk());

    owner
        .perform(checkIn(tuesdayClass, TUESDAY))
        .andExpect(jsonPath("$[*].firstName", contains("Alan")));
    mark(tuesdayClass, ada, TUESDAY, true)
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.detail").value("Ada Lovelace is not active"));
    assertThat(rows()).isEqualTo(1);
  }

  @Test
  void aClassWithAttendanceCannotBeRemovedAndOneWithoutCan() throws Exception {
    mark(tuesdayClass, ada, TUESDAY, true);
    String idle = schoolClass("Idle", "FRIDAY");

    owner
        .perform(delete(CLASSES + "/" + tuesdayClass))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.detail").value("Students have attended Tuesday Karate"));
    owner.perform(get(CLASSES + "/" + tuesdayClass)).andExpect(status().isOk());
    owner.perform(delete(CLASSES + "/" + idle)).andExpect(status().isNoContent());

    // taking the mark back frees the class
    mark(tuesdayClass, ada, TUESDAY, false);
    owner.perform(delete(CLASSES + "/" + tuesdayClass)).andExpect(status().isNoContent());
  }

  @Test
  void aClassWithAttendanceKeepsItsWeekdayButMayChangeAnythingElse() throws Exception {
    mark(tuesdayClass, ada, TUESDAY, true);
    Map<String, Object> change = new LinkedHashMap<>();
    change.put("name", "Tuesday Karate");
    change.put("weekday", "WEDNESDAY");
    change.put("startsAt", "17:00");
    change.put("endsAt", "18:00");
    change.put("version", 0);

    owner
        .perform(send(put(CLASSES + "/" + tuesdayClass), change))
        .andExpect(status().isConflict())
        .andExpect(
            jsonPath("$.detail")
                .value("Tuesday Karate has attendance on Tuesdays; it cannot move to another day"));

    change.put("weekday", "TUESDAY");
    change.put("endsAt", "18:30");
    owner
        .perform(send(put(CLASSES + "/" + tuesdayClass), change))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.endsAt").value("18:30:00"));

    // with the mark taken back, the class may move
    mark(tuesdayClass, ada, TUESDAY, false);
    change.put("weekday", "WEDNESDAY");
    change.put("version", 1);
    owner.perform(send(put(CLASSES + "/" + tuesdayClass), change)).andExpect(status().isOk());
  }

  @Test
  void anUnknownClassOrStudentIs404() throws Exception {
    UUID missing = UUID.randomUUID();

    owner
        .perform(checkIn(missing.toString(), TUESDAY))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.detail").value("No class " + missing));
    mark(missing.toString(), ada, TUESDAY, true).andExpect(status().isNotFound());
    mark(tuesdayClass, missing.toString(), TUESDAY, true)
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.detail").value("No student " + missing));
  }

  @Test
  void anInstructorChecksInButAMemberCannotAndSignedOutIs401() throws Exception {
    TestMember ivy = members.signedIn("Ivy", "ivy@example.org", Roles.INSTRUCTOR);
    TestMember mo = members.signedIn("Mo", "mo@example.org", Roles.MEMBER);

    ivy.perform(checkIn(tuesdayClass, TUESDAY)).andExpect(status().isOk());
    ivy.perform(markRequest(tuesdayClass, ada, TUESDAY, true)).andExpect(status().isOk());
    mo.perform(checkIn(tuesdayClass, TUESDAY)).andExpect(status().isForbidden());
    mo.perform(markRequest(tuesdayClass, ada, TUESDAY, true)).andExpect(status().isForbidden());
    members
        .anonymous()
        .perform(checkIn(tuesdayClass, TUESDAY))
        .andExpect(status().isUnauthorized());
  }

  private int rows() {
    return jdbc.queryForObject("select count(*) from attendance", Integer.class);
  }

  private void insert(String studentId, String date) {
    jdbc.update(
        "insert into attendance (id, version, class_id, student_id, attended_on)"
            + " values (gen_random_uuid(), 0, ?::uuid, ?::uuid, ?::date)",
        tuesdayClass,
        studentId,
        date);
  }

  private MockHttpServletRequestBuilder checkIn(String classId, String date) {
    return get(CLASSES + "/" + classId + "/check-in").param("date", date);
  }

  private org.springframework.test.web.servlet.ResultActions mark(
      String classId, String studentId, String date, boolean present) throws Exception {
    return owner.perform(markRequest(classId, studentId, date, present));
  }

  private MockHttpServletRequestBuilder markRequest(
      String classId, String studentId, String date, boolean present) throws Exception {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("studentId", studentId);
    body.put("date", date);
    body.put("present", present);
    return send(put(CLASSES + "/" + classId + "/attendance"), body);
  }

  private String schoolClass(String name, String weekday) throws Exception {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("name", name);
    body.put("weekday", weekday);
    body.put("startsAt", "17:00");
    body.put("endsAt", "18:00");
    return idOf(
        owner.perform(send(post(CLASSES), body)).andExpect(status().isCreated()).andReturn());
  }

  private String student(String firstName, String lastName) throws Exception {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("firstName", firstName);
    body.put("lastName", lastName);
    body.put("startDate", "2026-01-01");
    return idOf(
        owner
            .perform(send(post("/api/students"), body))
            .andExpect(status().isCreated())
            .andReturn());
  }

  private MockHttpServletRequestBuilder send(
      MockHttpServletRequestBuilder request, Map<String, Object> body) throws Exception {
    return request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
  }

  private String idOf(MvcResult result) throws Exception {
    return json.readTree(result.getResponse().getContentAsString()).get("id").asString();
  }
}
