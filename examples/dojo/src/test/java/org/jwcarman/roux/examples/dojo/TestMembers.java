package org.jwcarman.roux.examples.dojo;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.jwcarman.roux.examples.dojo.identity.AppRoles.AppRole;
import org.jwcarman.roux.examples.dojo.identity.OwnerBootstrap;
import org.jwcarman.roux.examples.dojo.members.MemberProfile;
import org.jwcarman.roux.examples.dojo.members.MemberProfileRepository;
import org.jwcarman.who.core.domain.Identity;
import org.jwcarman.who.core.service.WhoService;
import org.jwcarman.who.emaillink.EmailCredential;
import org.jwcarman.who.emaillink.EmailCredentialService;
import org.jwcarman.who.rbac.RbacService;
import org.jwcarman.who.rbac.Role;
import org.jwcarman.who.test.WhoMockMvcBrowser;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/** Members for an {@link AppTest}: a clean slate, and people signed in with a role. */
public class TestMembers {

  /** The owner's address, which the app makes the owner at startup and on every reset. */
  public static final String OWNER_EMAIL = "owner@example.com";

  /** who's tables; truncating them (cascading to what refers to them) removes every member. */
  private static final List<String> WHO_TABLES =
      List.of("who_identity", "who_role", "who_email_credential", "who_credential_identity");

  private final JdbcTemplate jdbc;
  private final OwnerBootstrap bootstrap;
  private final TestClock clock;
  private final MockMvc mvc;
  private final WhoService who;
  private final RbacService rbac;
  private final EmailCredentialService emailCredentials;
  private final MemberProfileRepository profiles;

  public TestMembers(
      JdbcTemplate jdbc,
      OwnerBootstrap bootstrap,
      TestClock clock,
      MockMvc mvc,
      WhoService who,
      RbacService rbac,
      EmailCredentialService emailCredentials,
      MemberProfileRepository profiles) {
    this.jdbc = jdbc;
    this.bootstrap = bootstrap;
    this.clock = clock;
    this.mvc = mvc;
    this.who = who;
    this.rbac = rbac;
    this.emailCredentials = emailCredentials;
    this.profiles = profiles;
  }

  /**
   * Starts a test from a clean slate: removes every member and empties {@code tables}, makes the
   * roles and the owner again as the app does at startup, and puts the clock back on real time.
   */
  public void reset(String... tables) {
    List<String> truncated = new ArrayList<>(WHO_TABLES);
    truncated.addAll(List.of(tables));
    jdbc.execute("truncate " + String.join(", ", truncated) + " cascade");
    clock.useRealTime();
    bootstrap.run(null);
  }

  /** A new member with {@code role}, a profile, and a browser signed in as them. */
  public TestMember signedIn(String name, String email, AppRole role) {
    return signedIn(name, email, rbac.findRequiredRole(role));
  }

  /** A new member with {@code role}, which need not be one of the app's, signed in. */
  public TestMember signedIn(String name, String email, Role role) {
    Identity identity = who.createIdentity();
    EmailCredential credential = emailCredentials.register(identity, email);
    rbac.assignRoleToIdentity(identity, role);
    profiles.save(new MemberProfile(identity.id(), name, credential.address()));
    return new TestMember(identity.id(), browserFor(identity.id(), credential));
  }

  /** The owner the app made from {@link #OWNER_EMAIL}, signed in. */
  public TestMember owner() {
    EmailCredential credential = emailCredentials.findByAddress(OWNER_EMAIL).orElseThrow();
    UUID id = who.resolve(credential::id).orElseThrow().identity().id();
    return new TestMember(id, browserFor(id, credential));
  }

  /** A browser with no one signed in. */
  public WhoMockMvcBrowser anonymous() {
    return new WhoMockMvcBrowser(mvc);
  }

  private WhoMockMvcBrowser browserFor(UUID id, EmailCredential credential) {
    return new WhoMockMvcBrowser(mvc).signedInAs(id, credential.id());
  }
}
