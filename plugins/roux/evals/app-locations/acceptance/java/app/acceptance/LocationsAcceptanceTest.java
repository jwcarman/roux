package app.acceptance;

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

/** The eval's hidden check of the Locations contract in the case's prompt; the agent never sees it. */
@AppTest
class LocationsAcceptanceTest {

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
  void theOwnerAddsALocationAndSeesItListed() throws Exception {
    create("Central " + tag, "MAIN_DOJO")
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.id").isNotEmpty())
        .andExpect(jsonPath("$.name").value("Central " + tag))
        .andExpect(jsonPath("$.kind").value("MAIN_DOJO"))
        .andExpect(jsonPath("$.version").isNumber());

    owner
        .perform(get("/api/locations"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[?(@.name == 'Central %s')].kind".formatted(tag)).value("MAIN_DOJO"));
  }

  @Test
  void theListIsSortedByName() throws Exception {
    create("Mid " + tag, "SATELLITE").andExpect(status().isCreated());
    create("Alpha " + tag, "OUTDOOR").andExpect(status().isCreated());
    create("Zulu " + tag, "MAIN_DOJO").andExpect(status().isCreated());

    String body = owner.perform(get("/api/locations")).andReturn().getResponse().getContentAsString();
    List<String> names = JsonPath.read(body, "$[*].name");
    assertThat(names).containsSubsequence("Alpha " + tag, "Mid " + tag, "Zulu " + tag);
  }

  @Test
  void theOwnerEditsALocation() throws Exception {
    String created =
        create("Park " + tag, "SATELLITE").andReturn().getResponse().getContentAsString();
    String id = JsonPath.read(created, "$.id");
    Number version = JsonPath.read(created, "$.version");

    owner
        .perform(
            put("/api/locations/" + id)
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"name\":\"Riverside %s\",\"kind\":\"OUTDOOR\",\"version\":%s}"
                        .formatted(tag, version)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").value("Riverside " + tag))
        .andExpect(jsonPath("$.kind").value("OUTDOOR"));

    owner
        .perform(get("/api/locations"))
        .andExpect(jsonPath("$[?(@.id == '%s')].name".formatted(id)).value("Riverside " + tag));
  }

  @Test
  void aBlankNameIsRefusedOnTheNameField() throws Exception {
    create("   ", "SATELLITE")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[?(@.field == 'name')]").isNotEmpty());
  }

  @Test
  void aNameOfFortyCharactersIsTakenAndFortyOneIsRefused() throws Exception {
    String forty = (tag + "x".repeat(40)).substring(0, 40);
    create(forty, "OUTDOOR").andExpect(status().isCreated());
    create(forty + "y", "OUTDOOR")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[?(@.field == 'name')]").isNotEmpty());
  }

  @Test
  void anotherLocationsNameIsRefusedOnTheNameField() throws Exception {
    create("Twin " + tag, "MAIN_DOJO").andExpect(status().isCreated());
    create("Twin " + tag, "SATELLITE")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[?(@.field == 'name')]").isNotEmpty());
  }

  @Test
  void someoneWhoIsNotTheOwnerCannotListLocations() throws Exception {
    member().perform(get("/api/locations")).andExpect(status().isForbidden());
  }

  @Test
  void someoneWhoIsNotTheOwnerCannotAddALocation() throws Exception {
    member()
        .perform(
            post("/api/locations")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"Sneaky %s\",\"kind\":\"OUTDOOR\"}".formatted(tag)))
        .andExpect(status().isForbidden());
  }

  private TestUser member() {
    return users.signedIn("Una User", "una-" + tag + "@example.test", "USER");
  }

  private ResultActions create(String name, String kind) throws Exception {
    return owner.perform(
        post("/api/locations")
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"name\":\"%s\",\"kind\":\"%s\"}".formatted(name, kind)));
  }
}
