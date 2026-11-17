package org.jwcarman.roux.examples.dojo.theme;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.jwcarman.roux.examples.dojo.AppTest;
import org.jwcarman.roux.examples.dojo.TestMember;
import org.jwcarman.roux.examples.dojo.TestMembers;
import org.jwcarman.roux.examples.dojo.identity.AppRoles.AppRole;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import tools.jackson.databind.json.JsonMapper;

@AppTest
class ThemeControllerTest {
  /** The name written into app-name.properties when the app was created. */
  @Value("${app.name}")
  String appName;

  private static final String THEME = "/api/theme";

  @Autowired TestMembers members;
  @Autowired JsonMapper json;

  @BeforeEach
  void cleanSlate() {
    members.reset("app_theme");
  }

  @Test
  void theDefaultsWhenNothingWasSaved() throws Exception {
    members
        .owner()
        .perform(get(THEME))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.palette").value("gray"))
        .andExpect(jsonPath("$.brandColor").value("#3b82f6"))
        .andExpect(jsonPath("$.shape").value("medium"))
        .andExpect(jsonPath("$.headingFont").value("standard"))
        .andExpect(jsonPath("$.bodyFont").value("standard"))
        .andExpect(jsonPath("$.appName").value(appName))
        .andExpect(jsonPath("$.version").value(0));
  }

  @Test
  void theOwnerSavesATheme() throws Exception {
    TestMember owner = members.owner();

    owner
        .perform(save(teal()))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.palette").value("teal"))
        .andExpect(jsonPath("$.brandColor").value("#ff8800"))
        .andExpect(jsonPath("$.shape").value("round"))
        .andExpect(jsonPath("$.headingFont").value("friendly"))
        .andExpect(jsonPath("$.bodyFont").value("modern"))
        .andExpect(jsonPath("$.appName").value("Dojo"))
        .andExpect(jsonPath("$.version").value(1));

    owner
        .perform(get(THEME))
        .andExpect(jsonPath("$.palette").value("teal"))
        .andExpect(jsonPath("$.brandColor").value("#ff8800"))
        .andExpect(jsonPath("$.appName").value("Dojo"))
        .andExpect(jsonPath("$.version").value(1));
  }

  @Test
  void aSavedThemeChangesAgainAtItsVersion() throws Exception {
    TestMember owner = members.owner();
    owner.perform(save(teal())).andExpect(status().isOk());

    Map<String, Object> blue = teal();
    blue.put("palette", "blue");
    blue.put("version", 1);
    owner
        .perform(save(blue))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.palette").value("blue"))
        .andExpect(jsonPath("$.version").value(2));
  }

  @Test
  void aStaleVersionIsAConflict() throws Exception {
    TestMember owner = members.owner();
    owner.perform(save(teal())).andExpect(status().isOk());

    owner
        .perform(save(teal()))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.status").value(409));
  }

  @ParameterizedTest
  @CsvSource(
      delimiter = '|',
      value = {
        "palette|mauve",
        "shape|oval",
        "headingFont|comic",
        "bodyFont|''",
        "brandColor|red",
        "brandColor|#12345",
        "appName|'   '",
        "appName|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      })
  void eachBadFieldIsRefused(String field, String value) throws Exception {
    Map<String, Object> body = teal();
    body.put(field, value);

    members
        .owner()
        .perform(save(body))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[?(@.field == '" + field + "')]").isNotEmpty());
  }

  @Test
  void aMissingFieldIsRefused() throws Exception {
    Map<String, Object> body = teal();
    body.remove("shape");

    members
        .owner()
        .perform(save(body))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[?(@.field == 'shape')]").isNotEmpty());
  }

  @Test
  void aMemberMayNotSeeOrChangeIt() throws Exception {
    TestMember ada = members.signedIn("Ada Lovelace", "ada@example.org", AppRole.MEMBER);

    ada.perform(get(THEME)).andExpect(status().isForbidden());
    ada.perform(save(teal())).andExpect(status().isForbidden());
  }

  @Test
  void signedOutIs401() throws Exception {
    members.anonymous().perform(get(THEME)).andExpect(status().isUnauthorized());
    members.anonymous().perform(save(teal())).andExpect(status().isUnauthorized());
  }

  /** Teal, an upper-case brand color and a padded name, at version 0. */
  private static Map<String, Object> teal() {
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("palette", "teal");
    body.put("brandColor", "#FF8800");
    body.put("shape", "round");
    body.put("headingFont", "friendly");
    body.put("bodyFont", "modern");
    body.put("appName", "  Dojo  ");
    body.put("version", 0);
    return body;
  }

  private MockHttpServletRequestBuilder save(Map<String, Object> body) {
    return put(THEME)
        .contentType(MediaType.APPLICATION_JSON)
        .content(json.writeValueAsString(body));
  }
}
