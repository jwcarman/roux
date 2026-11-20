package org.jwcarman.roux.examples.dojo.members;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.jwcarman.roux.examples.dojo.AppTest;
import org.jwcarman.roux.examples.dojo.TestMember;
import org.jwcarman.roux.examples.dojo.TestMembers;
import org.jwcarman.roux.examples.dojo.activity.ActivityEntry;
import org.jwcarman.roux.examples.dojo.activity.ActivityRepository;
import org.jwcarman.roux.examples.dojo.identity.Roles;
import org.jwcarman.roux.roles.RouxRoles;
import org.jwcarman.who.core.service.WhoService;
import org.jwcarman.who.rbac.RbacService;
import org.jwcarman.who.rbac.Role;
import org.jwcarman.who.test.WhoMockMvcBrowser;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.jayway.jsonpath.JsonPath;

@AppTest
class MembersControllerTest {

  private static final String ME = "/api/members/me";
  private static final String MEMBERS = "/api/members";
  private static final String INVITE = "/api/members/invitations";

  @Autowired MockMvc mvc;
  @Autowired JdbcTemplate jdbc;
  @Autowired TestMembers members;
  @Autowired WhoService who;
  @Autowired RbacService rbac;
  @Autowired MemberProfileRepository profiles;
  @Autowired ActivityRepository activities;

  @BeforeEach
  void cleanSlate() {
    members.reset();
  }

  @Test
  void everyEndpointIs401SignedOut() throws Exception {
    WhoMockMvcBrowser anonymous = members.anonymous();
    for (MockHttpServletRequestBuilder request : allEndpoints(0)) {
      anonymous.perform(request).andExpect(status().isUnauthorized());
    }
  }

  @Test
  void everyEndpointIs403WithoutMembersPermissions() throws Exception {
    Role customer = rbac.createRole("CUSTOMER");
    TestMember carl = members.signedIn("Carl", "carl@example.com", customer);

    for (MockHttpServletRequestBuilder request : allEndpoints(0)) {
      carl.perform(request).andExpect(status().isForbidden());
    }
  }

  @Test
  void memberReadsAndRenamesOwnProfile() throws Exception {
    TestMember ada = members.signedIn("Ada Lovelace", "ada@example.org", Roles.MEMBER);

    ada.browser()
        .perform(get(ME))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.displayName").value("Ada Lovelace"))
        .andExpect(jsonPath("$.email").value("ada@example.org"))
        .andExpect(jsonPath("$.version").value(0));

    ada.browser()
        .perform(rename(" Ada King ", 0))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.displayName").value("Ada King"))
        .andExpect(jsonPath("$.version").value(1));
    assertThat(profiles.findById(ada.id()).orElseThrow().getDisplayName()).isEqualTo("Ada King");
  }

  @Test
  void withoutAStatusOnlyActiveMembersAreListed() throws Exception {
    TestMember owner = members.signedIn("Olive Owner", "olive@example.org", RouxRoles.OWNER);
    members.signedIn("Ada Lovelace", "ada@example.org", Roles.MEMBER);
    TestMember grace = members.signedIn("Grace Hopper", "grace@example.org", Roles.MEMBER);
    who.deactivate(grace.id());

    owner
        .browser()
        .perform(get(MEMBERS).param("search", "e"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data[*].displayName", hasItem("Ada Lovelace")))
        .andExpect(jsonPath("$.data[*].displayName", not(hasItem("Grace Hopper"))))
        .andExpect(jsonPath("$.data[*].status", everyItem(is("ACTIVE"))));
  }

  @Test
  void deactivatedFilterListsOnlyDeactivated() throws Exception {
    TestMember owner = members.signedIn("Olive Owner", "olive@example.org", RouxRoles.OWNER);
    members.signedIn("Ada Lovelace", "ada@example.org", Roles.MEMBER);
    TestMember grace = members.signedIn("Grace Hopper", "grace@example.org", Roles.MEMBER);
    who.deactivate(grace.id());

    owner
        .browser()
        .perform(get(MEMBERS).param("status", "DEACTIVATED"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data[*].displayName", contains("Grace Hopper")))
        .andExpect(jsonPath("$.data[0].status").value("DEACTIVATED"));
  }

  @Test
  void roleFilterCombinesWithSearch() throws Exception {
    TestMember owner = members.signedIn("Olive Owner", "olive@example.org", RouxRoles.OWNER);
    members.signedIn("Ada Lovelace", "ada@example.org", Roles.MEMBER);
    members.signedIn("Ada Owner", "ada.owner@example.org", RouxRoles.OWNER);

    owner
        .browser()
        .perform(get(MEMBERS).param("role", "OWNER").param("search", "ada"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data[*].displayName", contains("Ada Owner")));
  }

  @Test
  void anUnknownFilterValueIs400WithAFieldMessage() throws Exception {
    TestMember owner = members.signedIn("Olive Owner", "olive@example.org", RouxRoles.OWNER);

    owner
        .browser()
        .perform(get(MEMBERS).param("status", "ASLEEP"))
        .andExpect(status().isBadRequest())
        .andExpect(
            jsonPath("$.errors[?(@.field == \'status\')].message")
                .value("Must be one of ACTIVE, DEACTIVATED"));
    owner
        .browser()
        .perform(get(MEMBERS).param("role", "KING"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[?(@.field == \'role\')].message").value("No such role"));
  }

  @Test
  void renameRecordsOldAndNewNames() throws Exception {
    TestMember ada = members.signedIn("Ada Lovelace", "ada@example.org", Roles.MEMBER);

    ada.browser().perform(rename("Ada King", 0)).andExpect(status().isOk());

    assertThat(activitiesOf(ada))
        .singleElement()
        .satisfies(
            entry -> {
              assertThat(entry.getAction()).isEqualTo("member.renamed");
              assertThat(entry.getSummary()).isEqualTo("Renamed from Ada Lovelace to Ada King");
              assertThat(entry.getActorId()).isEqualTo(ada.id());
            });
  }

  @Test
  void renamingToTheSameNameRecordsNothing() throws Exception {
    TestMember ada = members.signedIn("Ada Lovelace", "ada@example.org", Roles.MEMBER);

    ada.browser().perform(rename(" Ada Lovelace ", 0)).andExpect(status().isOk());

    assertThat(activitiesOf(ada)).isEmpty();
  }

  @Test
  void aRefusedRenameRecordsNothing() throws Exception {
    TestMember ada = members.signedIn("Ada Lovelace", "ada@example.org", Roles.MEMBER);

    ada.browser().perform(rename("Ada King", 7)).andExpect(status().isConflict());

    assertThat(activitiesOf(ada)).isEmpty();
  }

  private List<ActivityEntry> activitiesOf(TestMember member) {
    return activities
        .findBySubjectTypeAndSubjectId("member", member.id(), PageRequest.of(0, 10))
        .getContent();
  }

  @Test
  void renameChangesOnlyTheCallersRow() throws Exception {
    TestMember ada = members.signedIn("Ada Lovelace", "ada@example.org", Roles.MEMBER);
    TestMember grace = members.signedIn("Grace Hopper", "grace@example.com", Roles.MEMBER);

    ada.browser().perform(rename("Ada King", 0)).andExpect(status().isOk());

    assertThat(profiles.findById(grace.id()).orElseThrow().getDisplayName())
        .isEqualTo("Grace Hopper");
  }

  @Test
  void blankAndOverlongNamesAre400() throws Exception {
    TestMember ada = members.signedIn("Ada Lovelace", "ada@example.org", Roles.MEMBER);

    ada.browser()
        .perform(rename("   ", 0))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[?(@.field == \'displayName\')]").isNotEmpty());
    ada.browser()
        .perform(rename("a".repeat(81), 0))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[?(@.field == \'displayName\')]").isNotEmpty());
  }

  @Test
  void staleVersionIs409() throws Exception {
    TestMember ada = members.signedIn("Ada Lovelace", "ada@example.org", Roles.MEMBER);
    ada.browser().perform(rename("Ada King", 0)).andExpect(status().isOk());

    ada.browser()
        .perform(rename("Countess", 0))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.status").value(409));
    assertThat(profiles.findById(ada.id()).orElseThrow().getDisplayName()).isEqualTo("Ada King");
  }

  @Test
  void missingProfileIs404() throws Exception {
    TestMember ada = members.signedIn("Ada Lovelace", "ada@example.org", Roles.MEMBER);
    jdbc.update("delete from member_profile where id = ?", ada.id());

    ada.browser().perform(get(ME)).andExpect(status().isNotFound());
    ada.browser().perform(rename("Ada King", 0)).andExpect(status().isNotFound());
  }

  @Test
  void directoryPagesSearchesAndSorts() throws Exception {
    TestMember ada = members.signedIn("Ada Lovelace", "ada@example.org", Roles.MEMBER);
    members.signedIn("Grace Hopper", "grace@example.com", Roles.MEMBER);

    ada.browser()
        .perform(get(MEMBERS).param("sortBy", "NAME"))
        .andExpect(status().isOk())
        .andExpect(
            jsonPath(
                "$.data[*].displayName", contains("Ada Lovelace", "Grace Hopper", "Test Owner")))
        .andExpect(jsonPath("$.pagination.totalElementCount").value(3));
    ada.browser()
        .perform(get(MEMBERS).param("search", "ada"))
        .andExpect(jsonPath("$.data", hasSize(1)))
        .andExpect(jsonPath("$.data[0].id").value(ada.id().toString()))
        .andExpect(jsonPath("$.data[0].email").value("ada@example.org"))
        .andExpect(jsonPath("$.data[0].role").value("MEMBER"))
        .andExpect(jsonPath("$.pagination.totalElementCount").value(1));
    ada.browser()
        .perform(get(MEMBERS).param("sortBy", "ROLE"))
        .andExpect(jsonPath("$.data[0].role").value("OWNER"));
    ada.browser()
        .perform(get(MEMBERS).param("sortBy", "NAME").param("sortDirection", "DESC"))
        .andExpect(jsonPath("$.data[0].displayName").value("Test Owner"));
  }

  @Test
  void directoryWithoutSortByIsSortedByName() throws Exception {
    TestMember zed = members.signedIn("Zed Zimmer", "zed@example.com", Roles.MEMBER);
    members.signedIn("Ada Lovelace", "ada@example.org", Roles.MEMBER);

    zed.browser()
        .perform(get(MEMBERS))
        .andExpect(status().isOk())
        .andExpect(
            jsonPath(
                "$.data[*].displayName", contains("Ada Lovelace", "Test Owner", "Zed Zimmer")));
  }

  @ParameterizedTest
  @ValueSource(strings = {"", " ", "  "})
  void blankSortByIsSortedByName(String sortBy) throws Exception {
    TestMember zed = members.signedIn("Zed Zimmer", "zed@example.com", Roles.MEMBER);
    members.signedIn("Ada Lovelace", "ada@example.org", Roles.MEMBER);

    zed.browser()
        .perform(get(MEMBERS).param("sortBy", sortBy))
        .andExpect(status().isOk())
        .andExpect(
            jsonPath(
                "$.data[*].displayName", contains("Ada Lovelace", "Test Owner", "Zed Zimmer")));
  }

  @Test
  void membersWithTheSameNameAreEachListedOnceAcrossPages() throws Exception {
    TestMember first = members.signedIn("Sam Same", "sam1@example.com", Roles.MEMBER);
    TestMember second = members.signedIn("Sam Same", "sam2@example.com", Roles.MEMBER);
    TestMember third = members.signedIn("Sam Same", "sam3@example.com", Roles.MEMBER);

    List<String> listed = new ArrayList<>();
    for (int page = 0; page < 4; page++) {
      String body =
          first
              .browser()
              .perform(
                  get(MEMBERS)
                      .param("sortBy", "NAME")
                      .param("pageIndex", String.valueOf(page))
                      .param("pageSize", "1"))
              .andExpect(status().isOk())
              .andReturn()
              .getResponse()
              .getContentAsString();
      listed.addAll(JsonPath.read(body, "$.data[*].id"));
    }

    assertThat(listed)
        .hasSize(4)
        .doesNotHaveDuplicates()
        .contains(first.id().toString(), second.id().toString(), third.id().toString());
  }

  @Test
  void unknownSortByIs400() throws Exception {
    TestMember ada = members.signedIn("Ada Lovelace", "ada@example.org", Roles.MEMBER);

    ada.browser()
        .perform(get(MEMBERS).param("sortBy", "SALARY"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.detail").value("The request has invalid fields"))
        .andExpect(jsonPath("$.errors[?(@.field == \'sortBy\')]").isNotEmpty());
  }

  @Test
  void pagePastEndIsEmpty() throws Exception {
    TestMember ada = members.signedIn("Ada Lovelace", "ada@example.org", Roles.MEMBER);

    ada.browser()
        .perform(get(MEMBERS).param("pageIndex", "99"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.data", hasSize(0)))
        .andExpect(jsonPath("$.pagination.totalElementCount").value(2))
        .andExpect(jsonPath("$.pagination.hasNext").value(false));
  }

  @Test
  void pageSizeIsClamped() throws Exception {
    TestMember ada = members.signedIn("Ada Lovelace", "ada@example.org", Roles.MEMBER);

    ada.browser()
        .perform(get(MEMBERS).param("pageSize", "0"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.pagination.pageSize").value(1));
    ada.browser()
        .perform(get(MEMBERS).param("pageSize", "5000"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.pagination.pageSize").value(100));
  }

  @Test
  void putWithoutCsrfHeaderIs403() throws Exception {
    TestMember ada = members.signedIn("Ada Lovelace", "ada@example.org", Roles.MEMBER);
    ada.browser().perform(get(ME)).andExpect(status().isOk());

    // WhoMockMvcBrowser always echoes the CSRF cookie into the header, so send the request with
    // only the browser's session cookie.
    mvc.perform(rename("Ada King", 0).cookie(ada.browser().cookie("SESSION").orElseThrow()))
        .andExpect(status().isForbidden());
    assertThat(profiles.findById(ada.id()).orElseThrow().getDisplayName())
        .isEqualTo("Ada Lovelace");
  }

  private static MockHttpServletRequestBuilder rename(String name, long version) {
    return put(ME)
        .contentType(MediaType.APPLICATION_JSON)
        .content("{\"displayName\":\"" + name + "\",\"version\":" + version + "}");
  }

  private static List<MockHttpServletRequestBuilder> allEndpoints(long version) {
    return List.of(
        get(ME),
        rename("Someone", version),
        get(MEMBERS),
        post(INVITE)
            .contentType(MediaType.APPLICATION_JSON)
            .content("{\"name\":\"Someone\",\"email\":\"someone@example.com\"}"),
        get(MEMBERS + "/export.csv"),
        get(MEMBERS + "/" + SOMEONE),
        get(MEMBERS + "/" + SOMEONE + "/activities"),
        post(MEMBERS + "/" + SOMEONE + "/deactivate"),
        post(MEMBERS + "/" + SOMEONE + "/reactivate"));
  }

  /** Any member id: permission is checked before the member is looked up. */
  private static final UUID SOMEONE = UUID.fromString("0190c1de-0000-7000-8000-000000000001");
}
