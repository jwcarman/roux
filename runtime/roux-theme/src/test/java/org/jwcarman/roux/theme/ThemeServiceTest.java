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
package org.jwcarman.roux.theme;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.problems.InvalidFieldException;
import org.jwcarman.roux.spa.ShellTheme;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.test.util.ReflectionTestUtils;

@DisplayNameGeneration(ReplaceUnderscores.class)
class ThemeServiceTest {

  private static final ShellTheme DEFAULTS = ShellTheme.stock("Default");

  private final AppThemeRepository repository = mock(AppThemeRepository.class);
  private final ThemeService service = new ThemeService(repository, DEFAULTS);

  private AppTheme row(long version) {
    AppTheme theme = new AppTheme(AppTheme.ID);
    ReflectionTestUtils.setField(theme, "version", version);
    when(repository.findById(AppTheme.ID)).thenReturn(Optional.of(theme));
    return theme;
  }

  private static ThemeRequest request(Long version) {
    return new ThemeRequest("  Dojo  ", "teal", "#FF8800", "round", "friendly", "modern", version);
  }

  @Test
  void before_anything_is_saved_the_theme_is_the_defaults_at_version_zero() {
    row(0);

    assertThat(service.current()).isEqualTo(ThemeResponse.of(DEFAULTS, 0));
  }

  @Test
  void a_saved_theme_is_what_the_owner_chose_at_its_version() {
    AppTheme theme = row(3);
    theme.choose(new ShellTheme("Dojo", "teal", "#ff8800", "round", "friendly", "modern"));

    assertThat(service.current())
        .isEqualTo(new ThemeResponse("Dojo", "teal", "#ff8800", "round", "friendly", "modern", 3));
  }

  @Test
  void saving_takes_the_request_normalised_and_answers_the_saved_theme() {
    AppTheme theme = row(0);
    when(repository.saveAndFlush(theme))
        .thenAnswer(
            call -> {
              ReflectionTestUtils.setField(theme, "version", 1L);
              return theme;
            });

    ThemeResponse saved = service.update(request(0L));

    assertThat(saved)
        .isEqualTo(new ThemeResponse("Dojo", "teal", "#ff8800", "round", "friendly", "modern", 1));
    assertThat(ReflectionTestUtils.getField(theme, "appName")).isEqualTo("Dojo");
  }

  @Test
  void saving_from_a_stale_version_is_a_conflict_and_changes_nothing() {
    AppTheme theme = row(2);

    assertThatThrownBy(() -> service.update(request(1L)))
        .isInstanceOf(ObjectOptimisticLockingFailureException.class);

    assertThat(ReflectionTestUtils.getField(theme, "appName")).isNull();
    verify(repository, never()).saveAndFlush(any());
  }

  @Test
  void saving_without_a_version_is_refused() {
    row(0);

    assertThatThrownBy(() -> service.update(request(null)))
        .isInstanceOf(InvalidFieldException.class);
  }

  @Test
  void a_missing_row_says_to_include_the_changelog() {
    when(repository.findById(AppTheme.ID)).thenReturn(Optional.empty());

    assertThatThrownBy(service::current)
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("roux_theme has no row")
        .hasMessageContaining("migratory.enabled=false")
        .hasMessageContaining("classpath:org/jwcarman/roux/theme/db/roux-theme-changelog.xml");
    assertThatThrownBy(() -> service.update(request(0L))).isInstanceOf(IllegalStateException.class);
  }
}
