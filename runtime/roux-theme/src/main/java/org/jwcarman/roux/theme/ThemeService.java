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

import org.jwcarman.roux.jpa.Versions;
import org.jwcarman.roux.spa.ShellTheme;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reads and changes the owner's theme. Whatever the owner has not chosen is the app's default
 * ({@code roux.theme.*}), so the answer is always a whole theme.
 */
public class ThemeService {

  private final AppThemeRepository themes;
  private final ShellTheme defaults;

  /**
   * Creates the service.
   *
   * @param themes where the owner's theme is kept
   * @param defaults the theme for every part the owner has not chosen
   */
  public ThemeService(AppThemeRepository themes, ShellTheme defaults) {
    this.themes = themes;
    this.defaults = defaults;
  }

  /** The theme as it looks now, and the version an edit must be made from. */
  @Transactional(readOnly = true)
  public ThemeResponse current() {
    AppTheme theme = row();
    return ThemeResponse.of(theme.resolve(defaults), theme.getVersion());
  }

  /**
   * Saves the owner's theme.
   *
   * @throws org.jwcarman.roux.problems.InvalidFieldException if the request has no version
   * @throws org.springframework.orm.ObjectOptimisticLockingFailureException (a 409) if the theme
   *     was saved since the request's version
   */
  @Transactional
  public ThemeResponse update(ThemeRequest request) {
    AppTheme theme = row();
    Versions.require(theme, request.version());
    theme.choose(request.theme());
    AppTheme saved = themes.saveAndFlush(theme);
    return ThemeResponse.of(saved.resolve(defaults), saved.getVersion());
  }

  private AppTheme row() {
    return themes
        .findById(AppTheme.ID)
        .orElseThrow(
            () ->
                new IllegalStateException(
                    "roux_theme has no row: roux-theme's changelog has not run (migratory runs it;"
                        + " with migratory.enabled=false, include"
                        + " classpath:org/jwcarman/roux/theme/db/roux-theme-changelog.xml)"));
  }
}
