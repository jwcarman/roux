package org.jwcarman.roux.examples.dojo.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.examples.dojo.AppTest;
import org.jwcarman.roux.examples.dojo.TestMembers;
import org.jwcarman.roux.examples.dojo.theme.AppTheme.Settings;
import org.jwcarman.roux.examples.dojo.theme.ThemeService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.util.HtmlUtils;

import tools.jackson.databind.json.JsonMapper;

@AppTest
class ShellThemeTest {

  @Autowired TestMembers members;
  @Autowired ThemeService themes;
  @Autowired JsonMapper json;

  /** The name written into app-name.properties when the app was created. */
  @Value("${app.name}")
  String appName;

  @BeforeEach
  void cleanSlate() {
    members.reset("app_theme");
  }

  @Test
  void thePageCarriesTheDefaultsBeforeAnythingIsSaved() throws Exception {
    String page = signedOutPage();

    assertThat(page).contains("<title>" + HtmlUtils.htmlEscape(appName) + "</title>");
    assertThat(page)
        .contains("id=\"app-theme\"")
        .contains(
            ">{\"palette\":\"gray\",\"brandColor\":\"#3b82f6\",\"shape\":\"medium\","
                + "\"headingFont\":\"standard\",\"bodyFont\":\"standard\",\"appName\":"
                + json.writeValueAsString(appName).replace("<", "\\u003c")
                + "}"
                + "</script>");
  }

  @Test
  void thePageCarriesTheSavedTheme() throws Exception {
    themes.update(new Settings("teal", "#ff8800", "round", "friendly", "modern", "Dojo"), 0);

    String page = signedOutPage();

    assertThat(page).contains("<title>Dojo</title>");
    assertThat(page).contains("\"palette\":\"teal\"").contains("\"appName\":\"Dojo\"");
  }

  @Test
  void theAppNameCannotBreakOutOfThePage() throws Exception {
    themes.update(
        new Settings(
            "gray",
            "#3b82f6",
            "medium",
            "standard",
            "standard",
            "</title><script>alert(1)</script>"),
        0);

    String page = signedOutPage();

    assertThat(page)
        .contains("<title>&lt;/title&gt;&lt;script&gt;alert(1)&lt;/script&gt;</title>")
        .contains("\\u003c/title>\\u003cscript>alert(1)\\u003c/script>")
        .doesNotContain("<script>alert");
  }

  private String signedOutPage() throws Exception {
    return members
        .anonymous()
        .perform(get("/signin"))
        .andReturn()
        .getResponse()
        .getContentAsString();
  }
}
