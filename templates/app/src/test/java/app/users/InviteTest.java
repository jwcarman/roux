package app.users;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.jwcarman.roux.activity.ActivityRepository;
import org.jwcarman.roux.test.AppTest;
import org.jwcarman.roux.test.RecordingWhoEmailSender;
import org.jwcarman.roux.test.TestUsers;
import org.jwcarman.roux.users.AppUser;
import org.jwcarman.roux.users.AppUserRepository;
import org.jwcarman.roux.users.UserDirectory;
import org.jwcarman.who.core.domain.IdentityStatus;
import org.jwcarman.who.core.domain.WhoPrincipal;
import org.jwcarman.who.core.service.WhoService;
import org.jwcarman.who.emaillink.EmailCredential;
import org.jwcarman.who.emaillink.EmailCredentialService;
import org.jwcarman.who.emaillink.EmailLinkIssuer;
import org.jwcarman.who.emaillink.EmailLinkOutcome;
import org.jwcarman.who.emaillink.InvalidInvitationException;
import org.jwcarman.who.emaillink.InvitationService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.support.TransactionTemplate;

@ExtendWith(OutputCaptureExtension.class)
@AppTest
@Import(InviteTest.Mail.class)
class InviteTest {

  @TestConfiguration
  static class Mail {
    @Bean
    RecordingWhoEmailSender recordingSender() {
      return new RecordingWhoEmailSender();
    }
  }

  @Autowired JdbcTemplate jdbc;
  @Autowired TestUsers users;
  @Autowired EmailCredentialService emailCredentials;
  @Autowired InvitationService invitations;
  @Autowired RecordingWhoEmailSender mail;
  @Autowired TransactionTemplate tx;
  @Autowired WhoService who;
  @Autowired AppUserRepository profiles;
  @Autowired UserDirectory directory;
  @Autowired ActivityRepository activities;
  @Autowired EmailLinkIssuer linkIssuer;

  @BeforeEach
  void cleanSlate() {
    users.reset("who_email_link_token");
    mail.clear();
  }

  @Test
  void inviteCreatesUserWithCredentialAndSendsALink() throws Exception {
    invite(" Alice@Example.com ")
        .andExpect(status().isAccepted())
        .andExpect(jsonPath("$.linkSent").value(true));

    EmailCredential credential = emailCredentials.findByAddress("alice@example.com").orElseThrow();
    UUID identityId = identityOf(credential);
    assertThat(
            jdbc.queryForList(
                "select r.name from who_identity_role ir join who_role r on r.id = ir.role_id"
                    + " where ir.identity_id = ?",
                String.class,
                identityId))
        .containsExactly("USER");
    assertThat(mail.sent()).hasSize(1);
    assertThat(mail.sent().get(0).address()).isEqualTo("alice@example.com");
    assertThat(mail.sent().get(0).link()).contains("/signin/link#token=");
    // The link's token must be stored (committed), or signing in with it would fail.
    assertThat(count("who_email_link_token")).isEqualTo(1);
  }

  @Test
  void anInvitationCanAskForTheUserRoleOutright() throws Exception {
    invite("Mo User", "mo@example.org", "USER").andExpect(status().isAccepted());

    UUID identityId = identityOf(emailCredentials.findByAddress("mo@example.org").orElseThrow());
    assertThat(rolesOf(identityId)).containsExactly("USER");
  }

  @Test
  void anOwnerIsNeverInvited() throws Exception {
    long before = profiles.count();

    invite("Olive Again", "olive@example.org", "OWNER")
        .andExpect(status().isBadRequest())
        .andExpect(
            jsonPath("$.errors[?(@.field == 'role')].message").value("That role cannot be given"));
    invite("Nobody", "nobody@example.org", "KING")
        .andExpect(status().isBadRequest())
        .andExpect(
            jsonPath("$.errors[?(@.field == 'role')].message").value("That role cannot be given"));

    assertThat(emailCredentials.findByAddress("olive@example.org")).isEmpty();
    assertThat(profiles.count()).isEqualTo(before);
  }

  @Test
  void inviteCreatesTheProfile() throws Exception {
    invite(" Ada Lovelace ", " Ada@Example.org ").andExpect(status().isAccepted());

    UUID identityId = identityOf(emailCredentials.findByAddress("ada@example.org").orElseThrow());
    assertThat(profiles.findById(identityId).orElseThrow().getDisplayName())
        .isEqualTo("Ada Lovelace");
    assertThat(directory.findById(identityId).orElseThrow().getEmail())
        .isEqualTo("ada@example.org");
  }

  @Test
  void rejectedInviteLeavesNoProfile() throws Exception {
    long before = profiles.count();

    invite("Owner Again", "owner@example.com").andExpect(status().isBadRequest());

    assertThat(profiles.count()).isEqualTo(before);
  }

  @Test
  void inviteRecordsTheInvitation() throws Exception {
    UUID ownerId = identityOf(emailCredentials.findByAddress("owner@example.com").orElseThrow());

    invite("Ada Lovelace", "ada@example.org").andExpect(status().isAccepted());

    UUID adaId = identityOf(emailCredentials.findByAddress("ada@example.org").orElseThrow());
    assertThat(activities.history(adaId, PageRequest.of(0, 10)))
        .singleElement()
        .satisfies(
            entry -> {
              assertThat(entry.getType()).isEqualTo("user.invited");
              assertThat(entry.getDescription()).isEqualTo("Invited Ada Lovelace");
              assertThat(entry.getActorId()).isEqualTo(ownerId);
            });
  }

  @Test
  void aDeactivatedUserIsSentNoSignInLink() throws Exception {
    invite("Ada Lovelace", "ada@example.org").andExpect(status().isAccepted());
    UUID adaId = identityOf(emailCredentials.findByAddress("ada@example.org").orElseThrow());
    assertThat(mail.sent()).hasSize(1); // active, she was sent her invitation link
    mail.clear();

    who.deactivate(adaId);

    assertThat(linkIssuer.issue("ada@example.org", "token-2"))
        .isEqualTo(EmailLinkOutcome.INACTIVE_IDENTITY);
    assertThat(mail.sent()).isEmpty();
  }

  @Test
  void aRejectedInviteRecordsNothing() throws Exception {
    long before = activities.count();

    invite("Owner Again", "owner@example.com").andExpect(status().isBadRequest());

    assertThat(activities.count()).isEqualTo(before);
  }

  @Test
  void inviteIsAuditedAsTheInviter() throws Exception {
    UUID ownerId = identityOf(emailCredentials.findByAddress("owner@example.com").orElseThrow());

    invite("Ada Lovelace", "ada@example.org").andExpect(status().isAccepted());

    UUID adaId = identityOf(emailCredentials.findByAddress("ada@example.org").orElseThrow());
    assertThat(profiles.findById(adaId).orElseThrow().getCreatedBy()).isEqualTo(ownerId.toString());
  }

  @Test
  void inviteWhoseLinkIsNotSentSaysSoAndLogsTheOutcomeWithoutTheAddress(CapturedOutput output)
      throws Exception {
    mail.failSends();

    // The user is invited either way; the answer says the email did not go, so the inviter knows.
    invite("dave@example.com")
        .andExpect(status().isAccepted())
        .andExpect(jsonPath("$.linkSent").value(false));

    assertThat(mail.sent()).isEmpty();
    assertThat(output.getOut()).contains("not sent: SEND_FAILED");
    assertThat(output.getAll()).doesNotContain("dave@example.com");
  }

  @Test
  void inviteOfRegisteredAddressInAnyCaseIs400UnderEmail() throws Exception {
    int identities = count("who_identity");

    invite(" Owner@Example.COM ")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("email"))
        .andExpect(jsonPath("$.errors[0].message").value("That address already belongs to a user"));

    assertThat(count("who_identity")).isEqualTo(identities);
    assertThat(mail.sent()).isEmpty();
  }

  @Test
  void blankOrMalformedAddressIs400() throws Exception {
    invite("   ").andExpect(status().isBadRequest());
    invite("not-an-address").andExpect(status().isBadRequest());
    invite("two@at@signs.example.com")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.detail").value("The request has invalid fields"))
        .andExpect(jsonPath("$.errors[?(@.field == \'email\')]").isNotEmpty());
    assertThat(mail.sent()).isEmpty();
  }

  @Test
  void whoRefusesAnInvitationMadeInsideATransaction() {
    int identities = count("who_identity");

    assertThatThrownBy(
            () ->
                tx.executeWithoutResult(
                    status -> invitations.invite("bob@example.com", Set.of("USER"))))
        .isInstanceOf(IllegalStateException.class);

    assertThat(mail.sent()).isEmpty();
    assertThat(count("who_identity")).isEqualTo(identities);
  }

  @Test
  void aFailureInTheCallbackRollsTheInvitationBackAndSendsNothing() {
    int identities = count("who_identity");
    long profilesBefore = profiles.count();

    assertThatThrownBy(
            () ->
                invitations.invite(
                    "grace@example.org",
                    Set.of("USER"),
                    identity -> {
                      profiles.save(new AppUser(identity.id(), "Grace"));
                      throw new IllegalArgumentException("callback failed");
                    }))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessage("callback failed");

    assertThat(mail.sent()).isEmpty();
    assertThat(count("who_identity")).isEqualTo(identities);
    assertThat(profiles.count()).isEqualTo(profilesBefore);
    assertThat(emailCredentials.findByAddress("grace@example.org")).isEmpty();
  }

  @Test
  void anInvitationNeverGivesTheOwnerRoleWhoeverSendsIt() {
    int identities = count("who_identity");

    assertThatThrownBy(() -> invitations.invite("king@example.org", Set.of("OWNER")))
        .isInstanceOf(InvalidInvitationException.class);

    assertThat(mail.sent()).isEmpty();
    assertThat(count("who_identity")).isEqualTo(identities);
    assertThat(emailCredentials.findByAddress("king@example.org")).isEmpty();
  }

  @Test
  void whosOwnInviteEndpointRefusesTheOwnerRoleAsABadRequest() throws Exception {
    int identities = count("who_identity");

    users
        .owner()
        .browser()
        .perform(
            post("/who/invitations")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"king@example.org\",\"roles\":[\"OWNER\"]}"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("invalid-request"))
        .andExpect(jsonPath("$.detail").value("An invitation may only give [USER]"));

    assertThat(mail.sent()).isEmpty();
    assertThat(count("who_identity")).isEqualTo(identities);
  }

  private ResultActions invite(String email) throws Exception {
    return invite("New User", email);
  }

  private ResultActions invite(String name, String email) throws Exception {
    return users
        .owner()
        .perform(
            post("/api/users/invitations")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"name\":\"" + name + "\",\"email\":\"" + email + "\",\"role\":\"USER\"}"));
  }

  private ResultActions invite(String name, String email, String role) throws Exception {
    return users
        .owner()
        .perform(
            post("/api/users/invitations")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    "{\"name\":\"%s\",\"email\":\"%s\",\"role\":\"%s\"}"
                        .formatted(name, email, role)));
  }

  private List<String> rolesOf(UUID identityId) {
    return jdbc.queryForList(
        "select r.name from who_identity_role ir join who_role r on r.id = ir.role_id"
            + " where ir.identity_id = ?",
        String.class,
        identityId);
  }

  private UUID identityOf(EmailCredential credential) {
    WhoPrincipal principal = who.resolve(credential::id).orElseThrow();
    assertThat(principal.identity().status()).isEqualTo(IdentityStatus.ACTIVE);
    return principal.identity().id();
  }

  private int count(String table) {
    return jdbc.queryForObject("select count(*) from " + table, Integer.class);
  }
}
