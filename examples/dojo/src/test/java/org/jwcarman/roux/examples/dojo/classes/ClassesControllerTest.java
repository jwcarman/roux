package org.jwcarman.roux.examples.dojo.classes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.examples.dojo.AppTest;
import org.jwcarman.roux.examples.dojo.TestMember;
import org.jwcarman.roux.examples.dojo.TestMembers;
import org.jwcarman.roux.examples.dojo.identity.AppRoles.AppRole;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import tools.jackson.databind.ObjectMapper;

@AppTest
class ClassesControllerTest {

  private static final String CLASSES = "/api/classes";

  @Autowired TestMembers members;
  @Autowired ObjectMapper json;
  @Autowired JdbcTemplate jdbc;

  private TestMember owner;
  private TestMember ivy;
  private TestMember mo;

  @BeforeEach
  void cleanSlate() {
    members.reset("school_class");
    owner = members.owner();
    ivy = members.signedIn("Ivy Instructor", "ivy@example.org", AppRole.INSTRUCTOR);
    mo = members.signedIn("Mo Member", "mo@example.org", AppRole.MEMBER);
  }

  @Test
  void aClassIsAddedWithItsInstructorAndTimesToTheMinute() throws Exception {
    Map<String, Object> body = karate("Kids Karate", "MONDAY", "16:00", "17:00");
    body.put("instructorId", ivy.id().toString());

    owner
        .perform(send(post(CLASSES), body))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.name").value("Kids Karate"))
        .andExpect(jsonPath("$.weekday").value("MONDAY"))
        .andExpect(jsonPath("$.startsAt").value("16:00"))
        .andExpect(jsonPath("$.endsAt").value("17:00"))
        .andExpect(jsonPath("$.instructorName").value("Ivy Instructor"))
        .andExpect(jsonPath("$.version").value(0));
  }

  @Test
  void theTimetableRunsFromMondayEachDaysClassesByStartTime() throws Exception {
    add("Sparring", "WEDNESDAY", "19:00", "20:00");
    add("Kids", "MONDAY", "17:00", "18:00");
    add("Early bird", "MONDAY", "06:30", "07:30");
    add("Sunday open mat", "SUNDAY", "10:00", "12:00");

    owner
        .perform(get(CLASSES))
        .andExpect(status().isOk())
        .andExpect(
            jsonPath("$[*].name", contains("Early bird", "Kids", "Sparring", "Sunday open mat")))
        .andExpect(jsonPath("$[0].instructorName").value(nullValue()));
  }

  @Test
  void aClassIsReadByIdAndAnUnknownOneIs404() throws Exception {
    String id = add("Kids", "MONDAY", "17:00", "18:00");

    owner.perform(get(CLASSES + "/" + id)).andExpect(jsonPath("$.name").value("Kids"));
    UUID missing = UUID.randomUUID();
    owner
        .perform(get(CLASSES + "/" + missing))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.detail").value("No class " + missing));
    owner
        .perform(send(put(CLASSES + "/" + missing), existing("Kids", 0)))
        .andExpect(status().isNotFound());
    owner.perform(delete(CLASSES + "/" + missing)).andExpect(status().isNotFound());
  }

  @Test
  void aBlankOrTooLongNameAndMissingFieldsAreFieldErrors() throws Exception {
    owner
        .perform(send(post(CLASSES), karate("  ", "MONDAY", "16:00", "17:00")))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("name"))
        .andExpect(jsonPath("$.errors[0].message").value("Must not be blank"));
    owner
        .perform(send(post(CLASSES), karate("x".repeat(61), "MONDAY", "16:00", "17:00")))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("name"));

    owner
        .perform(send(post(CLASSES), new LinkedHashMap<>()))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors", hasSize(4)))
        .andExpect(jsonPath("$.errors[?(@.field == 'weekday')].message").value("Must not be empty"))
        .andExpect(
            jsonPath("$.errors[?(@.field == 'startsAt')].message").value("Must not be empty"))
        .andExpect(jsonPath("$.errors[?(@.field == 'endsAt')].message").value("Must not be empty"));
  }

  @Test
  void aTimeThatIsNotAClockTimeIs400NotA500() throws Exception {
    owner
        .perform(send(post(CLASSES), karate("Kids", "MONDAY", "6pm", "17:00")))
        .andExpect(status().isBadRequest());
    owner
        .perform(send(post(CLASSES), karate("Kids", "FUNDAY", "16:00", "17:00")))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("weekday"));
  }

  @Test
  void aClassMustEndAfterItStartsAndTheMessageIsOnEndsAt() throws Exception {
    for (String ends : new String[] {"16:00", "15:59"}) {
      owner
          .perform(send(post(CLASSES), karate("Kids", "MONDAY", "16:00", ends)))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.errors[0].field").value("endsAt"))
          .andExpect(jsonPath("$.errors[0].message").value("Must be after the start time"));
    }
    owner.perform(get(CLASSES)).andExpect(jsonPath("$", hasSize(0)));
  }

  @Test
  void anInstructorMustBeAnOwnerOrAnInstructor() throws Exception {
    for (String who : new String[] {mo.id().toString(), UUID.randomUUID().toString()}) {
      Map<String, Object> body = karate("Kids", "MONDAY", "16:00", "17:00");
      body.put("instructorId", who);
      owner
          .perform(send(post(CLASSES), body))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.errors[0].field").value("instructorId"))
          .andExpect(jsonPath("$.errors[0].message").value("Must be an owner or an instructor"));
    }
    Map<String, Object> byOwner = karate("Kids", "MONDAY", "16:00", "17:00");
    byOwner.put("instructorId", owner.id().toString());
    owner.perform(send(post(CLASSES), byOwner)).andExpect(status().isCreated());
  }

  @Test
  void theInstructorChoicesAreTheOwnerAndTheInstructorsByName() throws Exception {
    owner
        .perform(get(CLASSES + "/instructors"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[*].name", hasSize(2)))
        .andExpect(jsonPath("$[?(@.name == 'Ivy Instructor')].id").value(ivy.id().toString()))
        .andExpect(jsonPath("$[?(@.name == 'Mo Member')]").isEmpty());
  }

  @Test
  void anEditCarriesTheVersionAndAStaleOneIs409() throws Exception {
    String id = add("Kids", "MONDAY", "17:00", "18:00");

    Map<String, Object> change = existing("Kids Karate", 0);
    change.put("weekday", "TUESDAY");
    owner
        .perform(send(put(CLASSES + "/" + id), change))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").value("Kids Karate"))
        .andExpect(jsonPath("$.weekday").value("TUESDAY"))
        .andExpect(jsonPath("$.version").value(1));
    owner
        .perform(send(put(CLASSES + "/" + id), change))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.detail").value("This record changed since you loaded it"));

    Map<String, Object> unversioned = existing("Kids", 0);
    unversioned.remove("version");
    owner
        .perform(send(put(CLASSES + "/" + id), unversioned))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("version"));
  }

  @Test
  void anEditIsHeldToTheSameRulesAsAnAdd() throws Exception {
    String id = add("Kids", "MONDAY", "17:00", "18:00");

    Map<String, Object> change = existing("Kids", 0);
    change.put("endsAt", "16:00");
    owner
        .perform(send(put(CLASSES + "/" + id), change))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("endsAt"));
  }

  @Test
  void aClassIsRemoved() throws Exception {
    String id = add("Kids", "MONDAY", "17:00", "18:00");

    owner.perform(delete(CLASSES + "/" + id)).andExpect(status().isNoContent());
    owner.perform(get(CLASSES)).andExpect(jsonPath("$", hasSize(0)));
  }

  @Test
  void everyoneReadsTheTimetableButOnlyTheOwnerChangesIt() throws Exception {
    String id = add("Kids", "MONDAY", "17:00", "18:00");

    for (TestMember reader : new TestMember[] {ivy, mo}) {
      reader.perform(get(CLASSES)).andExpect(jsonPath("$", hasSize(1)));
      reader.perform(get(CLASSES + "/" + id)).andExpect(status().isOk());
      reader
          .perform(send(post(CLASSES), karate("Other", "MONDAY", "16:00", "17:00")))
          .andExpect(status().isForbidden());
      reader.perform(delete(CLASSES + "/" + id)).andExpect(status().isForbidden());
    }
    members.anonymous().perform(get(CLASSES)).andExpect(status().isUnauthorized());
  }

  @Test
  void theDatabaseItselfRefusesAClassThatEndsBeforeItStarts() {
    assertThatThrownBy(
            () ->
                jdbc.update(
                    "insert into school_class (id, version, name, weekday, starts_at, ends_at)"
                        + " values (gen_random_uuid(), 0, 'Bad', 'MONDAY', '17:00', '16:00')"))
        .isInstanceOf(DataIntegrityViolationException.class);
    assertThat(jdbc.queryForObject("select count(*) from school_class", Integer.class)).isZero();
  }

  private String add(String name, String weekday, String startsAt, String endsAt) throws Exception {
    MvcResult result =
        owner
            .perform(send(post(CLASSES), karate(name, weekday, startsAt, endsAt)))
            .andExpect(status().isCreated())
            .andReturn();
    return json.readTree(result.getResponse().getContentAsString()).get("id").asString();
  }

  private static Map<String, Object> karate(
      String name, String weekday, String startsAt, String endsAt) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("name", name);
    body.put("weekday", weekday);
    body.put("startsAt", startsAt);
    body.put("endsAt", endsAt);
    return body;
  }

  private static Map<String, Object> existing(String name, long version) {
    Map<String, Object> body = karate(name, "MONDAY", "17:00", "18:00");
    body.put("version", version);
    return body;
  }

  private MockHttpServletRequestBuilder send(
      MockHttpServletRequestBuilder request, Map<String, Object> body) throws Exception {
    return request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
  }
}
