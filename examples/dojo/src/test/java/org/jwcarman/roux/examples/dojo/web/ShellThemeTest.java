package org.jwcarman.roux.examples.dojo.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.examples.dojo.AppTest;
import org.jwcarman.roux.examples.dojo.TestMembers;
import org.jwcarman.roux.examples.dojo.identity.AppRoles.AppRole;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * The shell carries the owner's theme, through roux-theme's table: what the owner saves is what the
 * next visitor's page holds. (roux's own tests cover the shell and the theme API; this is the
 * dojo's wiring of them: its roles, its changelog and its application.yml.)
 */
@AppTest
class ShellThemeTest {

  @Autowired TestMembers members;
  @Autowired JdbcTemplate jdbc;

  @BeforeEach
  void cleanSlate() {
    members.reset();
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
    return members
        .anonymous()
        .perform(get("/signin").accept(MediaType.TEXT_HTML))
        .andReturn()
        .getResponse()
        .getContentAsString();
  }

  @Test
  void thePageCarriesTheDojosNameAndTheStockLookBeforeAnythingIsSaved() throws Exception {
    assertThat(signedOutPage())
        .contains("<title>Dojo</title>")
        .contains(
            ">{\"appName\":\"Dojo\",\"palette\":\"gray\",\"brandColor\":\"#3b82f6\","
                + "\"shape\":\"medium\",\"headingFont\":\"standard\",\"bodyFont\":\"standard\"}"
                + "</script>");
  }

  @Test
  void whatTheOwnerSavesIsWhatTheNextVisitorGets() throws Exception {
    members.owner().perform(save("Kicks")).andExpect(status().isOk());

    assertThat(signedOutPage())
        .contains("<title>Kicks</title>")
        .contains("\"palette\":\"teal\"")
        .contains("\"brandColor\":\"#ff8800\"");
  }

  @Test
  void aSignedOutVisitorCannotChangeItAndTheStoredThemeStaysAsItWas() throws Exception {
    int status =
        members.anonymous().perform(save("Hijacked")).andReturn().getResponse().getStatus();

    assertThat(status).isIn(401, 403);
    assertThat(
            jdbc.queryForObject(
                "select count(*) from roux_theme where app_name is not null", Integer.class))
        .isZero();
    assertThat(jdbc.queryForObject("select version from roux_theme", Integer.class)).isZero();
  }

  @Test
  void theOwnerMaySeeItAndAMemberMayNotChangeIt() throws Exception {
    members.anonymous().perform(get("/api/theme")).andExpect(status().isOk());
    members
        .signedIn("Ada Lovelace", "ada@example.org", AppRole.MEMBER)
        .perform(save("Mine"))
        .andExpect(status().isForbidden());
    members
        .owner()
        .perform(get("/api/theme"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.version").value(0));
  }
}
