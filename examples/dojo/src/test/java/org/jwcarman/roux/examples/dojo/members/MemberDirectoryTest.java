package org.jwcarman.roux.examples.dojo.members;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.examples.dojo.identity.Roles;
import org.jwcarman.roux.roles.RouxRoles;
import org.jwcarman.roux.test.AppTest;
import org.jwcarman.roux.test.TestUsers;
import org.jwcarman.who.core.domain.Identity;
import org.jwcarman.who.core.service.WhoService;
import org.jwcarman.who.rbac.RbacService;
import org.jwcarman.who.rbac.Role;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;

@AppTest
class MemberDirectoryTest {

  @Autowired JdbcTemplate jdbc;
  @Autowired TestUsers users;
  @Autowired WhoService who;
  @Autowired RbacService rbac;
  @Autowired MemberProfileRepository profiles;
  @Autowired MemberDirectoryRepository directory;

  @BeforeEach
  void cleanSlate() {
    users.reset();
    // Only the members each test seeds.
    jdbc.execute("truncate member_profile");
  }

  @Test
  void dualRoleIdentityAppearsOnceAsOwner() {
    UUID id = member("Boss", "boss@example.com", RouxRoles.OWNER, Roles.MEMBER);

    List<MemberDirectoryEntry> entries = directory.findAll();

    assertThat(entries).hasSize(1);
    assertThat(entries.getFirst().getId()).isEqualTo(id);
    assertThat(entries.getFirst().getRole()).isEqualTo("OWNER");
  }

  @Test
  void identityWithOnlyANonTeamRoleIsAbsent() {
    Role customer = rbac.createRole("CUSTOMER");
    Identity identity = who.createIdentity();
    rbac.assignRoleToIdentity(identity, customer);
    profiles.save(new MemberProfile(identity.id(), "Carl Customer", "carl@example.com"));
    member("Ada Lovelace", "ada@example.org", Roles.MEMBER);

    assertThat(directory.findAll())
        .extracting(MemberDirectoryEntry::getDisplayName)
        .containsExactly("Ada Lovelace");
  }

  @Test
  void searchMatchesNameAndEmailCaseInsensitively() {
    member("Ada Lovelace", "countess@example.org", Roles.MEMBER);
    member("Grace Hopper", "grace@example.com", Roles.MEMBER);

    assertThat(names(directory.search("ADA", PageRequest.of(0, 20))))
        .containsExactly("Ada Lovelace");
    assertThat(names(directory.search("Example.ORG", PageRequest.of(0, 20))))
        .containsExactly("Ada Lovelace");
  }

  @Test
  void searchTreatsWildcardsLiterally() {
    member("Ada Lovelace", "ada@example.org", Roles.MEMBER);
    member("Grace_Hopper", "grace@example.com", Roles.MEMBER);

    assertThat(directory.search("%", PageRequest.of(0, 20))).isEmpty();
    assertThat(names(directory.search("_", PageRequest.of(0, 20)))).containsExactly("Grace_Hopper");
  }

  @Test
  void sortsByNameEmailAndRoleBothWays() {
    member("Bea", "a@example.com", Roles.MEMBER);
    member("Al", "c@example.com", RouxRoles.OWNER);
    member("Cy", "b@example.com", Roles.MEMBER);

    assertThat(names(sorted(MemberSort.NAME, Sort.Direction.ASC)))
        .containsExactly("Al", "Bea", "Cy");
    assertThat(names(sorted(MemberSort.NAME, Sort.Direction.DESC)))
        .containsExactly("Cy", "Bea", "Al");
    assertThat(names(sorted(MemberSort.EMAIL, Sort.Direction.ASC)))
        .containsExactly("Bea", "Cy", "Al");
    assertThat(names(sorted(MemberSort.EMAIL, Sort.Direction.DESC)))
        .containsExactly("Al", "Cy", "Bea");
    assertThat(names(sorted(MemberSort.ROLE, Sort.Direction.ASC)).getFirst()).isEqualTo("Al");
    assertThat(names(sorted(MemberSort.ROLE, Sort.Direction.DESC)).getLast()).isEqualTo("Al");
  }

  @Test
  void deletingTheIdentityDeletesTheProfile() {
    UUID id = member("Ada Lovelace", "ada@example.org", Roles.MEMBER);

    who.deleteIdentity(id);

    assertThat(profiles.findById(id)).isEmpty();
  }

  @Test
  void auditingRecordsSystemOutsideARequest() {
    UUID id = member("Ada Lovelace", "ada@example.org", Roles.MEMBER);

    assertThat(
            jdbc.queryForObject(
                "select created_by from member_profile where id = ?", String.class, id))
        .isEqualTo("system");
    MemberProfile profile = profiles.findById(id).orElseThrow();
    assertThat(profile.getCreatedDate()).isNotNull();
  }

  private UUID member(String name, String email, String... roles) {
    Identity identity = who.createIdentity();
    for (String role : roles) {
      rbac.assignRoleToIdentity(identity, rbac.findRequiredRole(role));
    }
    profiles.save(new MemberProfile(identity.id(), name, email));
    return identity.id();
  }

  private Page<MemberDirectoryEntry> sorted(MemberSort sort, Sort.Direction direction) {
    return directory.search(
        null, PageRequest.of(0, 20, Sort.by(direction, sort.getSortProperty())));
  }

  private static List<String> names(Page<MemberDirectoryEntry> page) {
    return page.map(MemberDirectoryEntry::getDisplayName).getContent();
  }
}
