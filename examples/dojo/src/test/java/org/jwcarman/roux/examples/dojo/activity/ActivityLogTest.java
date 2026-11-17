package org.jwcarman.roux.examples.dojo.activity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.examples.dojo.AppTest;
import org.jwcarman.roux.examples.dojo.TestMembers;
import org.jwcarman.who.core.domain.Identity;
import org.jwcarman.who.core.domain.WhoPrincipal;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.support.TransactionTemplate;

@AppTest
class ActivityLogTest {

  @Autowired ActivityLog log;
  @Autowired ActivityRepository activities;
  @Autowired TransactionTemplate tx;
  @Autowired TestMembers members;

  private final UUID subject = UUID.randomUUID();

  @BeforeEach
  void cleanSlate() {
    members.reset("activity");
  }

  @AfterEach
  void signOut() {
    SecurityContextHolder.clearContext();
  }

  @Test
  void recordWritesAnEntryInTheCallersTransaction() {
    tx.executeWithoutResult(
        _ -> log.record("member", subject, "member.renamed", "Renamed from Ada to Ada King"));

    List<ActivityEntry> entries = entriesForSubject();
    assertThat(entries).hasSize(1);
    ActivityEntry entry = entries.get(0);
    assertThat(entry.getSubjectType()).isEqualTo("member");
    assertThat(entry.getSubjectId()).isEqualTo(subject);
    assertThat(entry.getAction()).isEqualTo("member.renamed");
    assertThat(entry.getSummary()).isEqualTo("Renamed from Ada to Ada King");
    assertThat(entry.getOccurredAt()).isNotNull();
  }

  @Test
  void aRolledBackChangeLeavesNoEntry() {
    assertThatThrownBy(
            () ->
                tx.executeWithoutResult(
                    _ -> {
                      log.record("member", subject, "member.renamed", "Renamed");
                      throw new IllegalStateException("the change failed");
                    }))
        .hasMessage("the change failed");

    assertThat(entriesForSubject()).isEmpty();
  }

  @Test
  void recordOutsideATransactionThrows() {
    assertThatThrownBy(() -> log.record("member", subject, "member.renamed", "Renamed"))
        .isInstanceOf(IllegalTransactionStateException.class);
  }

  @Test
  void theActorIsTheSignedInIdentity() {
    Identity actor = Identity.create();
    SecurityContextHolder.getContext()
        .setAuthentication(new TestingAuthenticationToken(new WhoPrincipal(actor, Set.of()), null));

    tx.executeWithoutResult(_ -> log.record("member", subject, "member.renamed", "Renamed"));

    assertThat(entriesForSubject().get(0).getActorId()).isEqualTo(actor.id());
  }

  @Test
  void theSystemHasNoActor() {
    tx.executeWithoutResult(_ -> log.record("member", subject, "member.invited", "Invited Ada"));

    assertThat(entriesForSubject().get(0).getActorId()).isNull();
  }

  private List<ActivityEntry> entriesForSubject() {
    return activities
        .findBySubjectTypeAndSubjectId("member", subject, PageRequest.of(0, 10))
        .getContent();
  }
}
