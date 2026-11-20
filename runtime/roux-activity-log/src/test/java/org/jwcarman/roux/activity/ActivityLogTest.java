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
package org.jwcarman.roux.activity;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.jwcarman.jpa.pagination.PageDto;
import org.jwcarman.jpa.pagination.PageSpec;
import org.jwcarman.jpa.pagination.SortDirection;
import org.jwcarman.jpa.spring.page.Paginator;
import org.jwcarman.who.core.domain.Identity;
import org.jwcarman.who.core.domain.WhoPrincipal;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import tools.jackson.databind.json.JsonMapper;

@DisplayNameGeneration(ReplaceUnderscores.class)
class ActivityLogTest {

  record Renamed(String from, String to) implements BusinessActivity {
    @Override
    public String type() {
      return "member.renamed";
    }

    @Override
    public String describe() {
      return "Renamed from " + from + " to " + to;
    }
  }

  record Typed(String type, String describe) implements BusinessActivity {}

  record Page(Integer pageIndex, Integer pageSize) implements PageSpec {
    @Override
    public String sortBy() {
      return "occurredAt";
    }

    @Override
    public SortDirection sortDirection() {
      return SortDirection.ASC;
    }
  }

  private static final Instant NOW = Instant.parse("2026-11-20T15:00:00Z");
  private static final UUID ANCHOR = UUID.randomUUID();

  private final ActivityRepository entries = mock(ActivityRepository.class);
  private final JsonMapper json = JsonMapper.builder().build();
  private Map<UUID, String> named = Map.of();
  private final AtomicInteger asked = new AtomicInteger();
  private final ActivityLog log =
      new ActivityLog(
          entries,
          json,
          Clock.fixed(NOW, ZoneOffset.UTC),
          ids -> {
            asked.incrementAndGet();
            return named;
          });

  @AfterEach
  void signOut() {
    SecurityContextHolder.clearContext();
  }

  private static UUID signedIn() {
    Identity identity = Identity.create();
    SecurityContextHolder.getContext()
        .setAuthentication(
            new TestingAuthenticationToken(new WhoPrincipal(identity, Set.of()), null));
    return identity.id();
  }

  private ActivityEntry saved() {
    ArgumentCaptor<ActivityEntry> entry = ArgumentCaptor.forClass(ActivityEntry.class);
    verify(entries).save(entry.capture());
    return entry.getValue();
  }

  @Test
  void appends_the_kind_its_sentence_and_its_fields() {
    UUID actor = signedIn();
    log.append(ANCHOR, new Renamed("Ada", "Ada King"));

    ActivityEntry entry = saved();
    assertThat(entry.getType()).isEqualTo("member.renamed");
    assertThat(entry.getDescription()).isEqualTo("Renamed from Ada to Ada King");
    assertThat(entry.getDetails()).isEqualTo("{\"from\":\"Ada\",\"to\":\"Ada King\"}");
    assertThat(entry.getOccurredAt()).isEqualTo(NOW);
    assertThat(entry.getActorId()).isEqualTo(actor);
    assertThat(entry.getAnchorId()).isEqualTo(ANCHOR);
    assertThat(entry.getRelatedIds()).isEmpty();
  }

  @Test
  void a_system_action_has_no_actor() {
    log.append(ANCHOR, new Renamed("a", "b"));
    assertThat(saved().getActorId()).isNull();
  }

  @Test
  void a_caller_who_is_not_whos_is_no_actor() {
    SecurityContextHolder.getContext()
        .setAuthentication(new TestingAuthenticationToken("someone", null));
    log.append(ANCHOR, new Renamed("a", "b"));
    assertThat(saved().getActorId()).isNull();
  }

  @Test
  void related_ids_are_kept_without_the_anchor_or_repeats() {
    UUID rank = UUID.randomUUID();
    log.append(ANCHOR, new Renamed("a", "b"), rank, rank, ANCHOR);
    assertThat(saved().getRelatedIds()).containsExactly(rank);
  }

  @Test
  void refuses_a_kind_that_is_not_a_record() {
    BusinessActivity notARecord =
        new BusinessActivity() {
          @Override
          public String type() {
            return "member.renamed";
          }

          @Override
          public String describe() {
            return "Renamed";
          }
        };
    assertThatIllegalArgumentException()
        .isThrownBy(() -> log.append(ANCHOR, notARecord))
        .withMessageContaining("record")
        .withMessageContaining(notARecord.getClass().getName());
  }

  @Test
  void refuses_a_malformed_type() {
    for (String type :
        new String[] {
          "Member.Renamed", "renamed", "member.", "a." + "b".repeat(99), "member renamed"
        }) {
      assertThatIllegalArgumentException()
          .isThrownBy(() -> log.append(ANCHOR, new Typed(type, "Renamed")))
          .withMessageContaining("type");
    }
  }

  @Test
  void refuses_a_null_type_or_description() {
    assertThatIllegalArgumentException()
        .isThrownBy(() -> log.append(ANCHOR, new Typed(null, "Renamed")))
        .withMessageContaining("type");
    assertThatIllegalArgumentException()
        .isThrownBy(() -> log.append(ANCHOR, new Typed("member.renamed", null)))
        .withMessageContaining("description");
  }

  @Test
  void jpa_can_make_an_empty_entry() {
    assertThat(new ActivityEntry() {}.getType()).isNull();
  }

  @Test
  void a_type_of_one_hundred_characters_is_fine() {
    log.append(ANCHOR, new Typed("a." + "b".repeat(98), "Renamed"));
    assertThat(saved().getType()).hasSize(100);
  }

  @Test
  void refuses_a_blank_or_long_description() {
    for (String description : new String[] {" ", "", "x".repeat(501)}) {
      assertThatIllegalArgumentException()
          .isThrownBy(() -> log.append(ANCHOR, new Typed("member.renamed", description)))
          .withMessageContaining("description");
    }
  }

  @Test
  void a_description_of_five_hundred_characters_is_fine() {
    log.append(ANCHOR, new Typed("member.renamed", "x".repeat(500)));
    assertThat(saved().getDescription()).hasSize(500);
  }

  @Test
  void refuses_a_null_related_id() {
    assertThatIllegalArgumentException()
        .isThrownBy(() -> log.append(ANCHOR, new Renamed("a", "b"), (UUID) null))
        .withMessageContaining("related");
  }

  private static ActivityEntry entry(UUID actor, String details) {
    return new ActivityEntry(NOW, actor, ANCHOR, new UUID[0], "member.renamed", "Renamed", details);
  }

  @Test
  void history_is_newest_first_with_names_asked_once_per_page() {
    UUID ann = UUID.randomUUID();
    UUID gone = UUID.randomUUID();
    named = Map.of(ann, "Ann");
    when(entries.history(any(), any()))
        .thenReturn(
            new PageImpl<>(
                List.of(
                    entry(ann, "{\"from\":\"a\",\"to\":\"b\"}"),
                    entry(gone, "{}"),
                    entry(null, "{}"),
                    entry(ann, "{}")),
                PageRequest.of(0, 20),
                4));

    PageDto<Activity> page = log.history(ANCHOR, new Page(null, null));

    assertThat(page.data())
        .extracting(Activity::actorName)
        .containsExactly("Ann", Activity.UNKNOWN, Activity.SYSTEM, "Ann");
    assertThat(asked).hasValue(1);
    assertThat(page.data().getFirst().details())
        .isEqualTo(json.readTree("{\"from\":\"a\",\"to\":\"b\"}"));
    assertThat(page.data().getFirst().type()).isEqualTo("member.renamed");
    assertThat(page.data().getFirst().description()).isEqualTo("Renamed");
    assertThat(page.data().getFirst().occurredAt()).isEqualTo(NOW);
    assertThat(page.data().getFirst().actorId()).isEqualTo(ann);
    assertThat(page.data().getFirst().id()).isNotNull();
  }

  @Test
  void a_page_with_only_system_actions_asks_no_names() {
    when(entries.history(any(), any()))
        .thenReturn(new PageImpl<>(List.of(entry(null, "{}")), PageRequest.of(0, 20), 1));
    log.history(ANCHOR, new Page(0, 20));
    assertThat(asked).hasValue(0);
  }

  private Pageable asked(PageSpec spec) {
    when(entries.history(any(), any())).thenReturn(new PageImpl<>(List.of()));
    log.history(ANCHOR, spec);
    ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);
    verify(entries, org.mockito.Mockito.atLeastOnce())
        .history(org.mockito.ArgumentMatchers.eq(ANCHOR), pageable.capture());
    return pageable.getValue();
  }

  @Test
  void history_clamps_the_page() {
    assertThat(asked(new Page(-1, 0))).isEqualTo(PageRequest.of(0, 1));
    assertThat(asked(new Page(2, 10_000)))
        .isEqualTo(PageRequest.of(2, Paginator.DEFAULT_MAX_PAGE_SIZE));
    assertThat(asked(new Page(null, null)))
        .isEqualTo(PageRequest.of(0, Paginator.DEFAULT_PAGE_SIZE));
  }

  @Test
  void history_answers_the_page_as_roux_lists_do() {
    when(entries.history(any(), any()))
        .thenReturn(new PageImpl<>(List.of(entry(null, "{}")), PageRequest.of(1, 1), 3));

    PageDto<Activity> page = log.history(ANCHOR, new Page(1, 1));

    assertThat(page.pagination().pageIndex()).isEqualTo(1);
    assertThat(page.pagination().pageSize()).isEqualTo(1);
    assertThat(page.pagination().totalElementCount()).isEqualTo(3);
    assertThat(page.pagination().totalPageCount()).isEqualTo(3);
    assertThat(page.pagination().hasNext()).isTrue();
    assertThat(page.pagination().hasPrevious()).isTrue();
  }
}
