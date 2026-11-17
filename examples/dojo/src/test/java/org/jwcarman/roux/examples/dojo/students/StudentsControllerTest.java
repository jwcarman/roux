package org.jwcarman.roux.examples.dojo.students;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.examples.dojo.AppTest;
import org.jwcarman.roux.examples.dojo.TestMember;
import org.jwcarman.roux.examples.dojo.TestMembers;
import org.jwcarman.roux.examples.dojo.identity.AppRoles.AppRole;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@AppTest
class StudentsControllerTest {

  private static final String STUDENTS = "/api/students";

  @Autowired TestMembers members;
  @Autowired ObjectMapper json;

  private TestMember owner;

  @BeforeEach
  void cleanSlate() {
    members.reset("promotion", "student", "rank");
    owner = members.owner();
  }

  @Test
  void aStudentIsAddedActiveWithNoRank() throws Exception {
    owner
        .perform(send(post(STUDENTS), student("Ada", "Lovelace")))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.firstName").value("Ada"))
        .andExpect(jsonPath("$.status").value("ACTIVE"))
        .andExpect(jsonPath("$.currentRank").value(nullValue()))
        .andExpect(jsonPath("$.version").value(0));
  }

  @Test
  void textIsStrippedAndABlankEmailOrPhoneIsNone() throws Exception {
    Map<String, Object> body = student("  Ada ", " Lovelace");
    body.put("email", "  ");
    body.put("phone", " ");

    owner
        .perform(send(post(STUDENTS), body))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.firstName").value("Ada"))
        .andExpect(jsonPath("$.lastName").value("Lovelace"))
        .andExpect(jsonPath("$.email").value(nullValue()))
        .andExpect(jsonPath("$.phone").value(nullValue()));
  }

  @Test
  void listingPagesAndSortsByEachKey() throws Exception {
    add("Grace", "Hopper", "2026-03-01");
    add("Ada", "Lovelace", "2026-02-01");
    add("Alan", "Turing", "2026-01-01");

    assertNames("NAME", "ASC", "Grace", "Ada", "Alan");
    assertNames("NAME", "DESC", "Alan", "Ada", "Grace");
    assertNames("START_DATE", "ASC", "Alan", "Ada", "Grace");
    assertNames("START_DATE", "DESC", "Grace", "Ada", "Alan");
    // nobody has a rank yet: RANK is accepted, and the tiebreaker keeps one order
    owner
        .perform(get(STUDENTS).param("sortBy", "RANK"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data", hasSize(3)));

    owner
        .perform(get(STUDENTS).param("pageSize", "2").param("pageIndex", "1"))
        .andExpect(jsonPath("$.data[*].firstName", contains("Alan")))
        .andExpect(jsonPath("$.pagination.totalElementCount").value(3));
  }

  @Test
  void searchLooksInNamesAndEmailIgnoringCase() throws Exception {
    Map<String, Object> ada = student("Ada", "Lovelace");
    ada.put("email", "countess@example.org");
    owner.perform(send(post(STUDENTS), ada)).andExpect(status().isCreated());
    add("Alan", "Turing", "2026-01-01");

    assertSearch("lovelace", "Ada");
    assertSearch("ALAN", "Alan");
    assertSearch("countess", "Ada");
    assertSearch("ada love", "Ada");
    owner
        .perform(get(STUDENTS).param("search", "nobody"))
        .andExpect(jsonPath("$.data", hasSize(0)));
  }

  @Test
  void theListShowsActiveStudentsUnlessAskedForInactive() throws Exception {
    JsonNode ada = add("Ada", "Lovelace", "2026-02-01");
    add("Alan", "Turing", "2026-01-01");
    owner.perform(post(STUDENTS + "/" + id(ada) + "/deactivate")).andExpect(status().isOk());

    owner.perform(get(STUDENTS)).andExpect(jsonPath("$.data[*].firstName", contains("Alan")));
    owner
        .perform(get(STUDENTS).param("status", "INACTIVE"))
        .andExpect(jsonPath("$.data[*].firstName", contains("Ada")));
    owner
        .perform(get(STUDENTS).param("status", "MAYBE"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("status"));
  }

  @Test
  void aRankFilterNobodyHoldsListsNobody() throws Exception {
    add("Ada", "Lovelace", "2026-02-01");

    owner
        .perform(get(STUDENTS).param("rankId", UUID.randomUUID().toString()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data", hasSize(0)));
  }

  @Test
  void anUnknownSortIs400OnSortBy() throws Exception {
    owner
        .perform(get(STUDENTS).param("sortBy", "AGE"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("sortBy"));
  }

  @Test
  void theRequestsRulesAreChecked() throws Exception {
    Map<String, Object> body = student(" ", "x".repeat(81));
    body.put("email", "not an address");
    body.put("phone", "12");
    body.put("birthDate", LocalDate.now().plusDays(1).toString());
    body.put("startDate", null);

    owner
        .perform(send(post(STUDENTS), body))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors", hasSize(6)))
        .andExpect(
            jsonPath("$.errors[?(@.field == 'firstName')].message").value("Must not be blank"))
        .andExpect(
            jsonPath("$.errors[?(@.field == 'lastName')].message")
                .value("Must be between 0 and 80 characters"))
        .andExpect(
            jsonPath("$.errors[?(@.field == 'email')].message")
                .value("Must be a valid email address"))
        .andExpect(
            jsonPath("$.errors[?(@.field == 'phone')].message")
                .value("Is not in the expected format"))
        .andExpect(
            jsonPath("$.errors[?(@.field == 'birthDate')].message")
                .value("Must not be in the future"))
        .andExpect(
            jsonPath("$.errors[?(@.field == 'startDate')].message").value("Must not be empty"));
  }

  @Test
  void theLongestEmailAndPhoneAreAccepted() throws Exception {
    Map<String, Object> body = student("Ada", "Lovelace");
    body.put("email", email(64, 255));
    body.put("phone", "+1 (555) 123-4567");
    body.put("birthDate", LocalDate.now().toString());

    owner.perform(send(post(STUDENTS), body)).andExpect(status().isCreated());
  }

  @Test
  void anEmailOrPhoneOverTheLimitIsRefused() throws Exception {
    Map<String, Object> body = student("Ada", "Lovelace");
    body.put("email", email(64, 256));
    body.put("phone", "1".repeat(31));

    owner
        .perform(send(post(STUDENTS), body))
        .andExpect(status().isBadRequest())
        .andExpect(
            jsonPath("$.errors[?(@.field == 'email')].message")
                .value(hasItem("Must be between 0 and 320 characters")))
        .andExpect(
            jsonPath("$.errors[?(@.field == 'phone')].message")
                .value("Must be between 0 and 30 characters"));
  }

  @Test
  void aStudentIsChangedAtTheVersionRead() throws Exception {
    JsonNode ada = add("Ada", "Lovelace", "2026-02-01");
    Map<String, Object> change = student("Ada", "King");
    change.put("version", 0);

    owner
        .perform(send(put(STUDENTS + "/" + id(ada)), change))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.lastName").value("King"))
        .andExpect(jsonPath("$.version").value(1));
  }

  @Test
  void aStaleVersionIs409() throws Exception {
    JsonNode ada = add("Ada", "Lovelace", "2026-02-01");
    Map<String, Object> change = student("Ada", "King");
    change.put("version", 0);
    owner.perform(send(put(STUDENTS + "/" + id(ada)), change)).andExpect(status().isOk());

    owner
        .perform(send(put(STUDENTS + "/" + id(ada)), change))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.detail").value("This record changed since you loaded it"));
  }

  @Test
  void anEditWithoutAVersionIs400OnVersion() throws Exception {
    JsonNode ada = add("Ada", "Lovelace", "2026-02-01");

    owner
        .perform(send(put(STUDENTS + "/" + id(ada)), student("Ada", "King")))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("version"));
  }

  @Test
  void anUnknownStudentIs404() throws Exception {
    UUID missing = UUID.randomUUID();
    Map<String, Object> change = student("Ada", "King");
    change.put("version", 0);

    owner
        .perform(send(put(STUDENTS + "/" + missing), change))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.detail").value("No student " + missing));
    owner.perform(post(STUDENTS + "/" + missing + "/deactivate")).andExpect(status().isNotFound());
  }

  @Test
  void deactivatingTwiceIs409() throws Exception {
    JsonNode ada = add("Ada", "Lovelace", "2026-02-01");
    String deactivate = STUDENTS + "/" + id(ada) + "/deactivate";

    owner
        .perform(post(deactivate))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("INACTIVE"));
    owner
        .perform(post(deactivate))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.detail").value("Ada Lovelace is already inactive"));
  }

  @Test
  void reactivatingAnActiveStudentIs409AndAnInactiveOneIsActiveAgain() throws Exception {
    JsonNode ada = add("Ada", "Lovelace", "2026-02-01");
    String base = STUDENTS + "/" + id(ada);

    owner
        .perform(post(base + "/reactivate"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.detail").value("Ada Lovelace is already active"));
    owner.perform(post(base + "/deactivate")).andExpect(status().isOk());
    owner
        .perform(post(base + "/reactivate"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("ACTIVE"));
  }

  @Test
  void aMemberReadsButCannotChange() throws Exception {
    JsonNode ada = add("Ada", "Lovelace", "2026-02-01");
    TestMember grace = members.signedIn("Grace", "grace@example.org", AppRole.MEMBER);
    String base = STUDENTS + "/" + id(ada);

    grace.perform(get(STUDENTS)).andExpect(status().isOk());
    for (MockHttpServletRequestBuilder write :
        List.of(
            send(post(STUDENTS), student("Alan", "Turing")),
            send(put(base), student("Ada", "King")),
            post(base + "/deactivate"),
            post(base + "/reactivate"))) {
      grace.perform(write).andExpect(status().isForbidden());
    }
  }

  @Test
  void signedOutIs401() throws Exception {
    members.anonymous().perform(get(STUDENTS)).andExpect(status().isUnauthorized());
  }

  private void assertNames(String sortBy, String direction, String... names) throws Exception {
    owner
        .perform(get(STUDENTS).param("sortBy", sortBy).param("sortDirection", direction))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data[*].firstName", contains((Object[]) names)));
  }

  private void assertSearch(String term, String... names) throws Exception {
    owner
        .perform(get(STUDENTS).param("search", term))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data[*].firstName", contains((Object[]) names)));
  }

  private JsonNode add(String firstName, String lastName, String startDate) throws Exception {
    Map<String, Object> body = student(firstName, lastName);
    body.put("startDate", startDate);
    MvcResult result =
        owner.perform(send(post(STUDENTS), body)).andExpect(status().isCreated()).andReturn();
    return json.readTree(result.getResponse().getContentAsString());
  }

  private static Map<String, Object> student(String firstName, String lastName) {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("firstName", firstName);
    body.put("lastName", lastName);
    body.put("startDate", "2026-01-01");
    return body;
  }

  /** An address of {@code local} + 1 + {@code domain} characters, in labels of at most 63. */
  private static String email(int local, int domain) {
    StringBuilder host = new StringBuilder();
    while (host.length() < domain) {
      int label = Math.min(63, domain - host.length());
      host.append("b".repeat(label));
      if (host.length() < domain) {
        host.append('.');
      }
    }
    return "a".repeat(local) + "@" + host;
  }

  private static String id(JsonNode student) {
    return student.get("id").asString();
  }

  private MockHttpServletRequestBuilder send(
      MockHttpServletRequestBuilder request, Map<String, Object> body) {
    return request.contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body));
  }
}
