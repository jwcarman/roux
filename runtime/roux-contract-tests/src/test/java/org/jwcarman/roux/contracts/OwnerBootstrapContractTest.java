/*
 * Copyright © 2026 James Carman
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.jwcarman.roux.contracts;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.roles.OwnerBootstrap;
import org.jwcarman.roux.roles.UserJoined;
import org.jwcarman.who.core.service.WhoService;
import org.jwcarman.who.emaillink.EmailCredentialService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Import;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * The first owner, from {@code roux.owner.*} in the tests' properties: made at the first start,
 * left alone once an active one exists, made again when none is active.
 */
@SpringBootTest(classes = ContractTestApplication.class)
@Import(OwnerBootstrapContractTest.Recorder.class)
class OwnerBootstrapContractTest {

  private static final String OWNER_EMAIL = "owner@roux.test";

  @Autowired OwnerBootstrap bootstrap;
  @Autowired JdbcClient jdbc;
  @Autowired WhoService who;
  @Autowired EmailCredentialService emails;
  @Autowired Recorder recorder;

  /** Records every {@link UserJoined}, and refuses it when told to. */
  @TestConfiguration(proxyBeanMethods = false)
  static class Recorder {
    final List<UserJoined> events = new CopyOnWriteArrayList<>();
    volatile boolean refuse;

    @EventListener
    void on(UserJoined event) {
      if (refuse) {
        throw new IllegalStateException("refused by the test");
      }
      events.add(event);
    }
  }

  @AfterEach
  void oneActiveOwnerAgain() {
    recorder.refuse = false;
    deleteEveryIdentity();
    bootstrap.run(null);
    recorder.events.clear();
  }

  private void deleteEveryIdentity() {
    jdbc.sql("select id from who_identity").query(UUID.class).list().forEach(who::deleteIdentity);
  }

  private List<UUID> owners(boolean activeOnly) {
    return jdbc.sql(
            "select ir.identity_id from who_identity_role ir join who_role r on r.id = ir.role_id"
                + " join who_identity i on i.id = ir.identity_id where r.name = 'OWNER'"
                + (activeOnly ? " and i.status = 'ACTIVE'" : ""))
        .query(UUID.class)
        .list();
  }

  private UUID theOwner() {
    List<UUID> owners = owners(true);
    assertThat(owners).hasSize(1);
    return owners.getFirst();
  }

  @Test
  void firstStartMadeTheOwner() {
    deleteEveryIdentity();
    bootstrap.run(null);

    UUID owner = theOwner();
    assertThat(emails.findByAddress(OWNER_EMAIL)).isPresent();
    assertThat(emails.findOldestFor(owner))
        .hasValueSatisfying(c -> assertThat(c.address()).isEqualTo(OWNER_EMAIL));
    assertThat(recorder.events)
        .containsExactly(new UserJoined(owner, "Contract Owner", OWNER_EMAIL, "OWNER"));
  }

  @Test
  void ownerExistsChangesNothing() {
    UUID owner = theOwner();
    recorder.events.clear();

    bootstrap.run(null);

    assertThat(owners(false)).containsExactly(owner);
    assertThat(recorder.events).isEmpty();
  }

  @Test
  void onlyDeactivatedOwnerGetsANewOne() {
    UUID old = theOwner();
    who.deactivate(old);
    jdbc.sql("update who_email_credential set address = 'old-owner@roux.test' where address = ?")
        .param(OWNER_EMAIL)
        .update();

    bootstrap.run(null);

    assertThat(owners(false)).hasSize(2).contains(old);
    UUID made = theOwner();
    assertThat(made).isNotEqualTo(old);
    assertThat(emails.findOldestFor(made))
        .hasValueSatisfying(c -> assertThat(c.address()).isEqualTo(OWNER_EMAIL));
  }

  @Test
  void addressHeldWithNoActiveOwnerFails() {
    UUID old = theOwner();
    who.deactivate(old);
    long identities = jdbc.sql("select count(*) from who_identity").query(Long.class).single();

    assertThatIllegalStateException()
        .isThrownBy(() -> bootstrap.run(null))
        .withMessageContaining("roux.owner.email");

    assertThat(jdbc.sql("select count(*) from who_identity").query(Long.class).single())
        .isEqualTo(identities);
  }

  @Test
  void listenerFailureRollsTheOwnerBack() {
    deleteEveryIdentity();
    recorder.refuse = true;

    assertThatThrownBy(() -> bootstrap.run(null)).hasMessageContaining("refused by the test");

    assertThat(owners(false)).isEmpty();
  }

  @Test
  void concurrentStartsMakeOneOwner() throws Exception {
    deleteEveryIdentity();
    CountDownLatch start = new CountDownLatch(1);
    try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
      List<CompletableFuture<Void>> runs =
          List.of(
              CompletableFuture.runAsync(() -> awaitThenRun(start), pool),
              CompletableFuture.runAsync(() -> awaitThenRun(start), pool));
      start.countDown();
      CompletableFuture.allOf(runs.toArray(CompletableFuture[]::new)).get(30, TimeUnit.SECONDS);
    }

    assertThat(owners(false)).hasSize(1);
  }

  private void awaitThenRun(CountDownLatch start) {
    try {
      start.await();
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(e);
    }
    bootstrap.run(null);
  }
}
