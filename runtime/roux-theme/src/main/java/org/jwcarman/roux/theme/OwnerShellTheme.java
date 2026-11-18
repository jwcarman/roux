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

import org.jwcarman.roux.spa.ShellTheme;
import org.jwcarman.roux.spa.ShellThemeSource;

/** The shell's theme source when the owner can change the theme: what the table holds. */
public class OwnerShellTheme implements ShellThemeSource {

  private final ThemeService themes;

  /** Creates the source. */
  public OwnerShellTheme(ThemeService themes) {
    this.themes = themes;
  }

  @Override
  public ShellTheme current() {
    ThemeResponse theme = themes.current();
    return new ShellTheme(
        theme.appName(),
        theme.palette(),
        theme.brandColor(),
        theme.shape(),
        theme.headingFont(),
        theme.bodyFont());
  }
}
