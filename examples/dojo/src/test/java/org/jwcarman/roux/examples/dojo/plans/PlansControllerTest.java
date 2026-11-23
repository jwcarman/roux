package org.jwcarman.roux.examples.dojo.plans;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.examples.dojo.identity.Roles;
import org.jwcarman.roux.test.AppTest;
import org.jwcarman.roux.test.TestUser;
import org.jwcarman.roux.test.TestUsers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

@AppTest
class PlansControllerTest {

  private static final String PLANS = "/api/plans";

  @Autowired TestUsers users;
  @Autowired ObjectMapper json;

  private TestUser owner;

  @BeforeEach
  void cleanSlate() {
    users.reset();
    owner = users.owner();
  }

  @Test
  void theOwnerAddsAPlan() throws Exception {
    save(post(PLANS), body("Monthly unlimited", 15000, "USD", "MONTHLY", true, null))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.name").value("Monthly unlimited"))
        .andExpect(jsonPath("$.price.minorUnits").value(15000))
        .andExpect(jsonPath("$.price.currency").value("USD"))
        .andExpect(jsonPath("$.period").value("MONTHLY"))
        .andExpect(jsonPath("$.active").value(true))
        .andExpect(jsonPath("$.inUse").value(false))
        .andExpect(jsonPath("$.version").value(0));

    owner.browser().perform(get(PLANS)).andExpect(jsonPath("$[0].name").value("Monthly unlimited"));
  }

  @Test
  void plansAreListedByName() throws Exception {
    create("Yearly", "YEARLY", true);
    create("Monthly", "MONTHLY", true);

    owner
        .browser()
        .perform(get(PLANS))
        .andExpect(jsonPath("$[0].name").value("Monthly"))
        .andExpect(jsonPath("$[1].name").value("Yearly"));
  }

  @Test
  void aNameIsUniqueIgnoringCase() throws Exception {
    create("Monthly unlimited", "MONTHLY", true);

    save(post(PLANS), body("monthly UNLIMITED", 100, "USD", "MONTHLY", true, null))
        .andExpect(status().isBadRequest())
        .andExpect(
            jsonPath("$.errors[?(@.field == 'name')].message").value("Another plan has this name"));
  }

  @Test
  void aPriceIsMoreThanZeroInTheSchoolsCurrency() throws Exception {
    save(post(PLANS), body("Free", 0, "USD", "MONTHLY", true, null))
        .andExpect(status().isBadRequest())
        .andExpect(
            jsonPath("$.errors[?(@.field == 'price')].message").value("Must be more than 0"));
    save(post(PLANS), body("Euro", 100, "EUR", "MONTHLY", true, null))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[?(@.field == 'price')].message").value("Must be in USD"));
  }

  @Test
  void anEditChangesNamePriceAndActive() throws Exception {
    JsonNode plan = create("Monthly", "MONTHLY", true);

    save(put(PLANS + "/" + id(plan)), body("Monthly basic", 12000, "USD", "MONTHLY", false, 0L))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").value("Monthly basic"))
        .andExpect(jsonPath("$.price.minorUnits").value(12000))
        .andExpect(jsonPath("$.active").value(false))
        .andExpect(jsonPath("$.version").value(1));
  }

  @Test
  void aStaleEditIsAConflict() throws Exception {
    JsonNode plan = create("Monthly", "MONTHLY", true);
    save(put(PLANS + "/" + id(plan)), body("Monthly 2", 100, "USD", "MONTHLY", true, 0L))
        .andExpect(status().isOk());

    save(put(PLANS + "/" + id(plan)), body("Monthly 3", 100, "USD", "MONTHLY", true, 0L))
        .andExpect(status().isConflict());
  }

  @Test
  void anUnusedPlanIsRemoved() throws Exception {
    JsonNode plan = create("Monthly", "MONTHLY", true);

    owner.browser().perform(delete(PLANS + "/" + id(plan))).andExpect(status().isNoContent());
    owner.browser().perform(get(PLANS)).andExpect(jsonPath("$.length()").value(0));
  }

  @Test
  void anUnknownPlanIs404() throws Exception {
    owner
        .browser()
        .perform(delete(PLANS + "/00000000-0000-0000-0000-000000000000"))
        .andExpect(status().isNotFound());
  }

  @Test
  void anInstructorReadsOnlyActivePlansAndChangesNone() throws Exception {
    create("Monthly", "MONTHLY", true);
    create("Old", "MONTHLY", false);
    TestUser ivy = users.signedIn("Ivy", "ivy@example.org", Roles.INSTRUCTOR);

    ivy.browser()
        .perform(get(PLANS + "/active"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(1))
        .andExpect(jsonPath("$[0].name").value("Monthly"));
    ivy.browser().perform(get(PLANS)).andExpect(status().isForbidden());
    ivy.browser()
        .perform(
            post(PLANS)
                .contentType(MediaType.APPLICATION_JSON)
                .content(body("New", 100, "USD", "MONTHLY", true, null)))
        .andExpect(status().isForbidden());
  }

  @Test
  void aMemberSeesNoPlans() throws Exception {
    TestUser max = users.signedIn("Max", "max@example.org", Roles.MEMBER);

    max.browser().perform(get(PLANS + "/active")).andExpect(status().isForbidden());
  }

  private JsonNode create(String name, String period, boolean active) throws Exception {
    MvcResult result =
        save(post(PLANS), body(name, 15000, "USD", period, active, null))
            .andExpect(status().isCreated())
            .andReturn();
    return json.readTree(result.getResponse().getContentAsString());
  }

  private ResultActions save(MockHttpServletRequestBuilder request, String body) throws Exception {
    return owner.browser().perform(request.contentType(MediaType.APPLICATION_JSON).content(body));
  }

  private static String id(JsonNode plan) {
    return plan.get("id").asString();
  }

  private String body(
      String name, long minorUnits, String currency, String period, boolean active, Long version) {
    return json.writeValueAsString(
        new Body(name, new Price(minorUnits, currency), period, active, version));
  }

  private record Price(long minorUnits, String currency) {}

  private record Body(String name, Price price, String period, boolean active, Long version) {}
}
