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
package org.jwcarman.roux.users;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.function.Function;
import java.util.regex.Pattern;

import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.From;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;

import org.springframework.data.jpa.domain.Specification;

/**
 * Which users a list shows: a search, a role and a status. The search matches as jpa-utils'
 * searchable repositories do: every word, whatever its case, in the name or the email ({@code %}
 * and {@code _} taken literally); a blank search matches everyone.
 *
 * <p>An app that lists its own entity with user columns (its entity joins {@link
 * UserDirectoryEntry}) filters it the same way with {@link #specification(Function)}.
 *
 * @param search words to find, or null
 * @param role a role's name, or null for every role
 * @param status the status to show; {@link UserStatus#ACTIVE} when null
 */
public record UserFilter(String search, String role, UserStatus status) {

  private static final Pattern WHITESPACE = Pattern.compile("\\s+");
  private static final int MAX_WORDS = 10;

  /** Compact constructor: a missing status is {@link UserStatus#ACTIVE}. */
  public UserFilter {
    status = status == null ? UserStatus.ACTIVE : status;
  }

  /**
   * The filter over the directory itself.
   *
   * @return the specification
   */
  public Specification<UserDirectoryEntry> specification() {
    return specification(root -> root);
  }

  /**
   * The filter over an app's own entity, through its path to the user's directory entry (for
   * example {@code root -> root.join("user")}).
   *
   * @param users the user's directory entry, from the app entity's root
   * @param <T> the app's entity
   * @return the specification
   */
  public <T> Specification<T> specification(
      Function<Root<T>, ? extends From<?, UserDirectoryEntry>> users) {
    return (root, query, builder) -> {
      From<?, UserDirectoryEntry> user = users.apply(root);
      List<Predicate> conditions = new ArrayList<>();
      for (String word : words()) {
        String pattern = "%" + escape(word) + "%";
        conditions.add(
            builder.or(
                like(builder, user, "displayName", pattern),
                like(builder, user, "email", pattern)));
      }
      if (role != null) {
        conditions.add(builder.equal(user.get("role"), role));
      }
      conditions.add(builder.equal(user.get("status"), status.name()));
      return builder.and(conditions.toArray(Predicate[]::new));
    };
  }

  private List<String> words() {
    if (search == null || search.isBlank()) {
      return List.of();
    }
    return WHITESPACE
        .splitAsStream(search.strip())
        .map(word -> word.toLowerCase(Locale.ROOT))
        .distinct()
        .limit(MAX_WORDS)
        .toList();
  }

  private static Predicate like(
      CriteriaBuilder builder, From<?, UserDirectoryEntry> user, String field, String pattern) {
    return builder.like(builder.lower(user.get(field)), pattern, '\\');
  }

  private static String escape(String word) {
    return word.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
  }
}
