package org.jwcarman.roux.examples.dojo.members;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.jwcarman.roux.examples.dojo.AppTest;
import org.jwcarman.roux.examples.dojo.RecordingEmailLinkSender;
import org.jwcarman.roux.examples.dojo.TestMembers;
import org.jwcarman.roux.examples.dojo.activity.ActivityRepository;
import org.jwcarman.who.core.domain.IdentityStatus;
import org.jwcarman.who.core.domain.WhoPrincipal;
import org.jwcarman.who.core.service.WhoService;
import org.jwcarman.who.emaillink.EmailCredential;
import org.jwcarman.who.emaillink.EmailCredentialService;
import org.jwcarman.who.emaillink.EmailLinkIssuer;
import org.jwcarman.who.emaillink.EmailLinkOutcome;
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
@Import(InvitationServiceTest.Mail.class)
class InvitationServiceTest {

  @TestConfiguration
  static class Mail {
    @Bean
    RecordingEmailLinkSender recordingSender() {
      return new RecordingEmailLinkSender();
    }
  }

  @Autowired JdbcTemplate jdbc;
  @Autowired TestMembers members;
  @Autowired EmailCredentialService emailCredentials;
  @Autowired InvitationService invitations;
  @Autowired RecordingEmailLinkSender mail;
  @Autowired TransactionTemplate tx;
  @Autowired WhoService who;
  @Autowired MemberProfileRepository profiles;
  @Autowired ActivityRepository activities;
  @Autowired EmailLinkIssuer linkIssuer;

  @BeforeEach
  void cleanSlate() {
    members.reset("who_email_link_token");
    mail.clear();
  }

  @Test
  void inviteCreatesMemberWithCredentialAndSendsALink() throws Exception {
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
        .containsExactly("MEMBER");
    assertThat(mail.sent()).hasSize(1);
    assertThat(mail.sent().get(0).address()).isEqualTo("alice@example.com");
    assertThat(mail.sent().get(0).link()).contains("/signin/link#token=");
    // The link's token must be stored (committed), or signing in with it would fail.
    assertThat(count("who_email_link_token")).isEqualTo(1);
  }

  @Test
  void inviteCreatesTheProfile() throws Exception {
    invite(" Ada Lovelace ", " Ada@Example.org ").andExpect(status().isAccepted());

    UUID identityId = identityOf(emailCredentials.findByAddress("ada@example.org").orElseThrow());
    MemberProfile profile = profiles.findById(identityId).orElseThrow();
    assertThat(profile.getDisplayName()).isEqualTo("Ada Lovelace");
    assertThat(profile.getEmail()).isEqualTo("ada@example.org");
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
    assertThat(activities.findBySubjectTypeAndSubjectId("member", adaId, PageRequest.of(0, 10)))
        .singleElement()
        .satisfies(
            entry -> {
              assertThat(entry.getAction()).isEqualTo("member.invited");
              assertThat(entry.getSummary()).isEqualTo("Invited Ada Lovelace");
              assertThat(entry.getActorId()).isEqualTo(ownerId);
            });
  }

  @Test
  void aDeactivatedMemberIsSentNoSignInLink() throws Exception {
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

    // The member is invited either way; the answer says the email did not go, so the inviter knows.
    invite("dave@example.com")
        .andExpect(status().isAccepted())
        .andExpect(jsonPath("$.linkSent").value(false));

    assertThat(mail.sent()).isEmpty();
    assertThat(output.getOut()).contains("Invitation link not sent: SEND_FAILED");
    assertThat(output.getAll()).doesNotContain("dave@example.com");
  }

  @Test
  void inviteOfRegisteredAddressInAnyCaseIs400UnderEmail() throws Exception {
    int identities = count("who_identity");

    invite(" Owner@Example.COM ")
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("email"))
        .andExpect(jsonPath("$.errors[0].message").value("That address is already a member"));

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
  void rolledBackInviteSendsNothing() {
    int identities = count("who_identity");

    try {
      tx.executeWithoutResult(
          status -> {
            invitations.invite("Bob", "bob@example.com");
            throw new IllegalStateException("force rollback");
          });
    } catch (IllegalStateException expected) {
      assertThat(expected).hasMessage("force rollback");
    }

    assertThat(mail.sent()).isEmpty();
    assertThat(count("who_identity")).isEqualTo(identities);
    assertThat(emailCredentials.findByAddress("bob@example.com")).isEmpty();
  }

  private ResultActions invite(String email) throws Exception {
    return invite("New Member", email);
  }

  private ResultActions invite(String name, String email) throws Exception {
    return members
        .owner()
        .perform(
            post("/api/members/invitations")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"" + name + "\",\"email\":\"" + email + "\"}"));
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
