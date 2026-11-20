package org.jwcarman.roux.examples.dojo.members;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.examples.dojo.identity.Roles;
import org.jwcarman.roux.test.AppTest;
import org.jwcarman.roux.test.TestMember;
import org.jwcarman.roux.test.TestMembers;
import org.jwcarman.who.core.service.WhoService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.TestPropertySource;

/** The directory as a CSV file; the row cap is lowered to 3 so a test can pass it. */
@AppTest
@TestPropertySource(properties = "app.export.max-rows=3")
class MembersExportTest {

  @Autowired TestMembers members;
  @Autowired WhoService who;

  private TestMember owner;
  @Autowired JdbcClient jdbc;

  @BeforeEach
  void cleanSlate() {
    members.reset();
    owner = members.owner();
  }

  @Test
  void theFileIsTheFilteredSortedDirectory() throws Exception {
    member("Zoë Ångström", "zoe@example.org");
    UUID grace = member("Grace Hopper", "grace@example.org");
    who.deactivate(grace);

    byte[] body =
        owner
            .perform(
                get("/api/members/export.csv")
                    .param("sortBy", "NAME")
                    .param("sortDirection", "DESC"))
            .andExpect(status().isOk())
            .andExpect(header().string("Content-Type", "text/csv;charset=UTF-8"))
            .andExpect(
                header().string("Content-Disposition", "attachment; filename=\"members.csv\""))
            .andReturn()
            .getResponse()
            .getContentAsByteArray();

    List<String> lines = new String(body, StandardCharsets.UTF_8).lines().toList();
    assertThat(lines.get(0)).isEqualTo("﻿Name,Email,Role,Status,Joined");
    assertThat(lines.subList(1, lines.size()))
        .hasSize(2)
        .satisfiesExactly(
            line -> assertThat(line).startsWith("Zoë Ångström,zoe@example.org,MEMBER,ACTIVE,20"),
            line -> assertThat(line).startsWith("Test Owner,owner@example.com,OWNER,ACTIVE,20"));
  }

  @Test
  void theJoinedDateIsTheSchoolsDay() throws Exception {
    // Joined at 03:00 UTC on Nov 21, which is still Nov 20 in New York.
    UUID late = member("Late Joiner", "late@example.org");
    jdbc.sql("update who_identity set created_at = ? where id = ?")
        .params(Timestamp.from(Instant.parse("2026-11-21T03:00:00Z")), late)
        .update();

    String body =
        owner
            .perform(get("/api/members/export.csv").param("search", "late@example.org"))
            .andReturn()
            .getResponse()
            .getContentAsString(StandardCharsets.UTF_8);
    assertThat(body).contains("Late Joiner,late@example.org,MEMBER,ACTIVE,2026-11-20");
  }

  @Test
  void theStatusFilterChoosesDeactivatedMembers() throws Exception {
    UUID grace = member("Grace Hopper", "grace@example.org");
    who.deactivate(grace);

    String body =
        owner
            .perform(get("/api/members/export.csv").param("status", "DEACTIVATED"))
            .andExpect(status().isOk())
            .andReturn()
            .getResponse()
            .getContentAsString(StandardCharsets.UTF_8);

    assertThat(body.lines().skip(1)).singleElement().asString().startsWith("Grace Hopper,");
  }

  @Test
  void moreRowsThanTheCapIsRefused() throws Exception {
    member("Ada Lovelace", "ada@example.org");
    member("Grace Hopper", "grace@example.org");
    member("Katherine Johnson", "katherine@example.org");

    owner
        .perform(get("/api/members/export.csv"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.detail").value("The request has invalid fields"))
        .andExpect(jsonPath("$.errors.length()").value(1))
        .andExpect(jsonPath("$.errors[0].field").value("export"))
        .andExpect(jsonPath("$.errors[0].message").value("Narrow the list to export it"));
  }

  private UUID member(String name, String email) {
    return members.signedIn(name, email, Roles.MEMBER).id();
  }
}
