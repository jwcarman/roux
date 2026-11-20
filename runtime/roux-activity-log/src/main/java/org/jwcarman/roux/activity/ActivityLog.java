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

import java.time.Clock;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.jspecify.annotations.Nullable;
import org.jwcarman.jpa.pagination.PageDto;
import org.jwcarman.jpa.pagination.PageSpec;
import org.jwcarman.jpa.pagination.PaginationDto;
import org.jwcarman.jpa.spring.page.Paginator;
import org.jwcarman.who.core.domain.WhoPrincipal;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import tools.jackson.databind.json.JsonMapper;

/**
 * The business activity log: {@link #append} says what happened to a record, in the transaction
 * that changes it; {@link #history} reads a record's history a page at a time.
 */
public class ActivityLog {

  private static final Pattern TYPE = Pattern.compile("[a-z][a-z0-9_]*+(?:\\.[a-z][a-z0-9_]*+)++");
  private static final int MAX_TYPE = 100;
  private static final int MAX_DESCRIPTION = 500;

  private final ActivityRepository entries;
  private final JsonMapper json;
  private final Clock clock;
  private final ActorNames names;

  /**
   * The log over {@code entries}, writing details with the app's {@code json} mapper, the time from
   * its {@code clock}, and actors named by {@code names}.
   */
  public ActivityLog(ActivityRepository entries, JsonMapper json, Clock clock, ActorNames names) {
    this.entries = entries;
    this.json = json;
    this.clock = clock;
    this.names = names;
  }

  /**
   * Says that {@code activity} happened to the record {@code anchor} (and concerns the records
   * {@code related}), done by whoever is signed in (the system when no one is), now.
   *
   * @throws IllegalArgumentException when {@code activity} is not a Java record, its type is not a
   *     lower-case dotted code of at most 100 characters, its description is blank or over 500
   *     characters, or a related id is {@code null}
   * @throws org.springframework.transaction.IllegalTransactionStateException outside a transaction
   */
  @Transactional(propagation = Propagation.MANDATORY)
  public void append(UUID anchor, BusinessActivity activity, UUID... related) {
    Objects.requireNonNull(anchor, "anchor");
    if (!activity.getClass().isRecord()) {
      throw new IllegalArgumentException(
          "An activity must be a record: " + activity.getClass().getName());
    }
    String type = activity.type();
    if (type == null || type.length() > MAX_TYPE || !TYPE.matcher(type).matches()) {
      throw new IllegalArgumentException(
          "An activity's type must be a lower-case dotted code of at most "
              + MAX_TYPE
              + " characters (member.renamed): "
              + type);
    }
    String description = activity.describe();
    if (description == null || description.isBlank() || description.length() > MAX_DESCRIPTION) {
      throw new IllegalArgumentException(
          "An activity's description must be a sentence of at most "
              + MAX_DESCRIPTION
              + " characters: "
              + type);
    }
    Set<UUID> others = new LinkedHashSet<>();
    for (UUID id : related) {
      if (id == null) {
        throw new IllegalArgumentException("A related id is null: " + type);
      }
      if (!id.equals(anchor)) {
        others.add(id);
      }
    }
    entries.save(
        new ActivityEntry(
            clock.instant(),
            actor(),
            anchor,
            others.toArray(UUID[]::new),
            type,
            description,
            json.writeValueAsString(activity)));
  }

  /**
   * Every activity anchored to {@code id} or related to it, newest first, a page at a time ({@code
   * page}'s index and size, clamped as roux's lists are; its sort is ignored).
   */
  @Transactional(readOnly = true)
  public PageDto<Activity> history(UUID id, PageSpec page) {
    int index = page.pageIndex() == null ? Paginator.FIRST_PAGE : Math.max(0, page.pageIndex());
    int size =
        page.pageSize() == null
            ? Paginator.DEFAULT_PAGE_SIZE
            : Math.clamp(page.pageSize(), Paginator.MIN_PAGE_SIZE, Paginator.DEFAULT_MAX_PAGE_SIZE);
    Page<ActivityEntry> found = entries.history(id, PageRequest.of(index, size));
    Set<UUID> actors =
        found.getContent().stream()
            .map(ActivityEntry::getActorId)
            .filter(Objects::nonNull)
            .collect(Collectors.toSet());
    Map<UUID, String> named = actors.isEmpty() ? Map.of() : names.namesOf(actors);
    return new PageDto<>(
        found.getContent().stream().map(entry -> activity(entry, named)).toList(),
        new PaginationDto(
            found.getNumber(),
            found.getSize(),
            found.getTotalElements(),
            found.getTotalPages(),
            found.hasNext(),
            found.hasPrevious()));
  }

  private Activity activity(ActivityEntry entry, Map<UUID, String> named) {
    UUID actor = entry.getActorId();
    String name = actor == null ? Activity.SYSTEM : named.getOrDefault(actor, Activity.UNKNOWN);
    return new Activity(
        entry.getId(),
        entry.getOccurredAt(),
        entry.getType(),
        entry.getDescription(),
        actor,
        name,
        json.readTree(entry.getDetails()));
  }

  private static @Nullable UUID actor() {
    Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
    return authentication != null && authentication.getPrincipal() instanceof WhoPrincipal who
        ? who.identity().id()
        : null;
  }
}
