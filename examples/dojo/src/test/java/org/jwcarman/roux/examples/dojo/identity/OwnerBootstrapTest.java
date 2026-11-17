package org.jwcarman.roux.examples.dojo.identity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.examples.dojo.DojoApplication;
import org.jwcarman.roux.examples.dojo.TestDatabase;
import org.jwcarman.roux.examples.dojo.members.MemberProfileRepository;
import org.jwcarman.who.core.service.WhoService;
import org.jwcarman.who.emaillink.EmailCredentialService;
import org.jwcarman.who.rbac.RbacService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@SpringBootTest(properties = "app.owner-email= Owner@Example.COM ")
class OwnerBootstrapTest {

  static final TestDatabase.Database DATABASE = TestDatabase.create();

  @DynamicPropertySource
  static void database(DynamicPropertyRegistry registry) {
    TestDatabase.register(registry, DATABASE);
  }

  @Autowired OwnerBootstrap bootstrap;
  @Autowired EmailCredentialService emailCredentials;
  @Autowired JdbcTemplate jdbc;
  @Autowired TransactionTemplate tx;
  @Autowired RbacService rbac;
  @Autowired WhoService who;
  @Autowired MemberProfileRepository profiles;
  @Autowired PlatformTransactionManager transactionManager;

  @BeforeEach
  void cleanSlate() {
    jdbc.execute(
        "truncate who_identity, who_role, who_email_credential, who_credential_identity cascade");
  }

  @Test
  void bootstrapCreatesRolesAndOwner() throws Exception {
    bootstrap.run(null);

    assertThat(ownerCount()).isEqualTo(1);
    assertThat(emailCredentials.findByAddress("owner@example.com")).isPresent();
  }

  @Test
  void rolesCarryTheirPermissions() throws Exception {
    bootstrap.run(null);

    assertThat(permissionsOf("OWNER"))
        .containsExactlyInAnyOrder(
            "members.invite",
            "members.read",
            "members.profile",
            "members.manage",
            "theme.manage",
            "ranks.read",
            "ranks.manage",
            "students.read",
            "students.manage",
            "promotions.manage");
    assertThat(permissionsOf("MEMBER"))
        .containsExactlyInAnyOrder(
            "members.read", "members.profile", "ranks.read", "students.read");
  }

  @Test
  void aRoleCreatedBeforeAPermissionExistedGainsIt() throws Exception {
    bootstrap.run(null);
    jdbc.update(
        "delete from who_role_permission where permission = 'members.manage'"
            + " and role_id = (select id from who_role where name = 'OWNER')");
    assertThat(permissionsOf("OWNER")).doesNotContain("members.manage");

    bootstrap.run(null);

    assertThat(permissionsOf("OWNER")).contains("members.manage");
  }

  @Test
  void bootstrapCreatesTheOwnersProfile() throws Exception {
    bootstrap.run(null);

    assertThat(
            jdbc.queryForMap(
                "select p.display_name, p.email from member_profile p"
                    + " join who_identity_role ir on ir.identity_id = p.id"
                    + " join who_role r on r.id = ir.role_id where r.name = 'OWNER'"))
        .containsEntry("display_name", "Test Owner")
        .containsEntry("email", "owner@example.com");
  }

  @Test
  void secondStartCreatesNoSecondProfile() throws Exception {
    bootstrap.run(null);
    bootstrap.run(null);

    assertThat(jdbc.queryForObject("select count(*) from member_profile", Integer.class))
        .isEqualTo(1);
  }

  @Test
  void ownerNameIsRequired() {
    assertThatThrownBy(
            () ->
                new SpringApplicationBuilder(DojoApplication.class)
                    .web(WebApplicationType.NONE)
                    .run(
                        "--spring.datasource.url=" + DATABASE.url(),
                        "--spring.datasource.username=" + DATABASE.username(),
                        "--spring.datasource.password=" + DATABASE.password(),
                        "--spring.docker.compose.enabled=false",
                        "--app.owner-email=owner@example.com",
                        "--app.owner-name= "))
        .hasStackTraceContaining("app.owner-name");
  }

  @Test
  void bootstrapIsIdempotent() throws Exception {
    bootstrap.run(null);
    bootstrap.run(null);

    assertThat(ownerCount()).isEqualTo(1);
    assertThat(jdbc.queryForObject("select count(*) from who_role", Integer.class)).isEqualTo(2);
    assertThat(jdbc.queryForObject("select count(*) from who_identity", Integer.class))
        .isEqualTo(1);
  }

  @Test
  void aChangedOwnerEmailCreatesNoSecondOwner() throws Exception {
    bootstrap.run(null);

    bootstrapFor("new-owner@example.com").run(null);

    assertThat(ownerCount()).isEqualTo(1);
    assertThat(emailCredentials.findByAddress("owner@example.com")).isPresent();
    assertThat(emailCredentials.findByAddress("new-owner@example.com")).isEmpty();
  }

  @Test
  void aChangedOwnerEmailMakesTheNewAddressTheOwnerWhenNoOwnerIsLeft() throws Exception {
    bootstrap.run(null);
    jdbc.execute("delete from who_identity");

    bootstrapFor("new-owner@example.com").run(null);

    assertThat(ownerCount()).isEqualTo(1);
    assertThat(emailCredentials.findByAddress("new-owner@example.com")).isPresent();
  }

  private OwnerBootstrap bootstrapFor(String ownerEmail) {
    return new OwnerBootstrap(
        jdbc,
        rbac,
        who,
        emailCredentials,
        new AppProperties(ownerEmail, "New Owner", "http://localhost:8080"),
        profiles,
        transactionManager);
  }

  @Test
  void deletedOwnerIdentityIsRecreated() throws Exception {
    bootstrap.run(null);
    jdbc.execute("delete from who_identity");
    assertThat(ownerCount()).isZero();

    bootstrap.run(null);

    assertOwnerRecreated();
  }

  @Test
  void deletedOwnerAndCredentialIsRecreated() throws Exception {
    bootstrap.run(null);
    jdbc.execute("truncate who_identity, who_email_credential, who_credential_identity cascade");
    assertThat(ownerCount()).isZero();

    bootstrap.run(null);

    assertOwnerRecreated();
  }

  private void assertOwnerRecreated() {
    assertThat(ownerCount()).isEqualTo(1);
    assertThat(emailCredentials.findByAddress("owner@example.com")).isPresent();
    assertThat(jdbc.queryForObject("select count(*) from who_role", Integer.class)).isEqualTo(2);
  }

  @Test
  void concurrentStartsCreateOneOwner() throws Exception {
    ExecutorService pool = Executors.newFixedThreadPool(2);
    CountDownLatch go = new CountDownLatch(1);
    try {
      List<Future<?>> runs =
          List.of(pool.submit(() -> runAfter(go)), pool.submit(() -> runAfter(go)));
      go.countDown();
      for (Future<?> run : runs) {
        run.get();
      }
    } finally {
      pool.shutdown();
    }
    assertThat(ownerCount()).isEqualTo(1);
    assertThat(jdbc.queryForObject("select count(*) from member_profile", Integer.class))
        .isEqualTo(1);
  }

  @Test
  void bootstrapInsideACallersTransactionLeavesItCommittable() throws Exception {
    bootstrap.run(null);

    // The owner exists, so who's register refuses and marks its transaction rollback-only. That
    // must be the bootstrap's own transaction, not the caller's.
    tx.executeWithoutResult(_ -> bootstrap.run(null));

    assertThat(ownerCount()).isEqualTo(1);
  }

  private Void runAfter(CountDownLatch go) throws Exception {
    go.await();
    bootstrap.run(null);
    return null;
  }

  @Test
  void ownerEmailIsNormalized() throws Exception {
    bootstrap.run(null);

    List<String> addresses =
        jdbc.queryForList("select address from who_email_credential", String.class);
    assertThat(addresses).containsExactly("owner@example.com");
  }

  @Test
  void ownerEmailIsRequired() {
    assertThatThrownBy(
            () ->
                new SpringApplicationBuilder(DojoApplication.class)
                    .web(WebApplicationType.NONE)
                    .run(
                        "--spring.datasource.url=" + DATABASE.url(),
                        "--spring.datasource.username=" + DATABASE.username(),
                        "--spring.datasource.password=" + DATABASE.password(),
                        "--spring.docker.compose.enabled=false"))
        .hasStackTraceContaining("app.owner-email");
  }

  private Set<String> permissionsOf(String role) {
    return Set.copyOf(
        jdbc.queryForList(
            "select p.permission from who_role_permission p join who_role r on r.id = p.role_id"
                + " where r.name = ?",
            String.class,
            role));
  }

  private int ownerCount() {
    return jdbc.queryForObject(
        "select count(*) from who_identity_role ir join who_role r on r.id = ir.role_id"
            + " where r.name = 'OWNER'",
        Integer.class);
  }
}
