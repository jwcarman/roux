package app.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.test.AppTest;
import org.jwcarman.roux.test.TestUsers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.util.HtmlUtils;

import com.jayway.jsonpath.JsonPath;

import app.identity.Roles;

/**
 * The shell carries the owner's theme, through roux-theme's table: what the owner saves is what the
 * next visitor's page holds. (roux's own tests cover the shell and the theme API; this is the app's
 * wiring of them: its roles, its changelog and its application.yml.)
 */
@AppTest
class ShellThemeTest {

  /** The theme the shell carries: a script element holding one JSON object. */
  private static final Pattern THEME_SCRIPT =
      Pattern.compile("<script[^>]*>(\\{\"appName\".*?)</script>");

  @Autowired TestUsers users;
  @Autowired JdbcTemplate jdbc;

  /** What the app is called until the owner renames it. */
  @Value("${roux.theme.app-name}")
  String appName;

  @BeforeEach
  void cleanSlate() {
    users.reset();
    jdbc.update(
        "update roux_theme set version = 0, app_name = null, palette = null, brand_color = null,"
            + " shape = null, heading_font = null, body_font = null");
  }

  private static MockHttpServletRequestBuilder save(String name) {
    return put("/api/theme")
        .contentType(MediaType.APPLICATION_JSON)
        .content(
            "{\"appName\":\""
                + name
                + "\",\"palette\":\"teal\",\"brandColor\":\"#FF8800\",\"shape\":\"round\","
                + "\"headingFont\":\"friendly\",\"bodyFont\":\"modern\",\"version\":0}");
  }

  private String signedOutPage() throws Exception {
    return users
        .anonymous()
        .perform(get("/signin").accept(MediaType.TEXT_HTML))
        .andReturn()
        .getResponse()
        .getContentAsString();
  }

  @Test
  void thePageCarriesTheAppsNameAndTheStockLookBeforeAnythingIsSaved() throws Exception {
    String page = signedOutPage();
    Matcher theme = THEME_SCRIPT.matcher(page);

    assertThat(page).contains("<title>" + HtmlUtils.htmlEscape(appName) + "</title>");
    assertThat(theme.find()).as("the theme's script element").isTrue();
    String json = theme.group(1);
    assertThat(JsonPath.<String>read(json, "$.appName")).isEqualTo(appName);
    assertThat(JsonPath.<String>read(json, "$.palette")).isEqualTo("gray");
    assertThat(JsonPath.<String>read(json, "$.brandColor")).isEqualTo("#3b82f6");
    assertThat(JsonPath.<String>read(json, "$.shape")).isEqualTo("medium");
    assertThat(JsonPath.<String>read(json, "$.headingFont")).isEqualTo("standard");
    assertThat(JsonPath.<String>read(json, "$.bodyFont")).isEqualTo("standard");
  }

  @Test
  void whatTheOwnerSavesIsWhatTheNextVisitorGets() throws Exception {
    users.owner().perform(save("Kicks")).andExpect(status().isOk());

    assertThat(signedOutPage())
        .contains("<title>Kicks</title>")
        .contains("\"palette\":\"teal\"")
        .contains("\"brandColor\":\"#ff8800\"");
  }

  @Test
  void aSignedOutVisitorCannotChangeItAndTheStoredThemeStaysAsItWas() throws Exception {
    int status = users.anonymous().perform(save("Hijacked")).andReturn().getResponse().getStatus();

    assertThat(status).isIn(401, 403);
    assertThat(
            jdbc.queryForObject(
                "select count(*) from roux_theme where app_name is not null", Integer.class))
        .isZero();
    assertThat(jdbc.queryForObject("select version from roux_theme", Integer.class)).isZero();
  }

  @Test
  void theOwnerMaySeeItAndAUserMayNotChangeIt() throws Exception {
    users.anonymous().perform(get("/api/theme")).andExpect(status().isOk());
    users
        .signedIn("Ada Lovelace", "ada@example.org", Roles.USER)
        .perform(save("Mine"))
        .andExpect(status().isForbidden());
    users
        .owner()
        .perform(get("/api/theme"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.version").value(0));
  }
}
