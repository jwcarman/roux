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
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.spa.ShellTheme;

@DisplayNameGeneration(ReplaceUnderscores.class)
class OwnerShellThemeTest {

  @Test
  void the_shell_gets_the_theme_the_service_resolves_each_time() {
    ThemeService themes = mock(ThemeService.class);
    when(themes.current())
        .thenReturn(new ThemeResponse("Dojo", "teal", "#ff8800", "round", "friendly", "modern", 4))
        .thenReturn(ThemeResponse.of(ShellTheme.stock("Next"), 5));
    OwnerShellTheme source = new OwnerShellTheme(themes);

    assertThat(source.current())
        .isEqualTo(new ShellTheme("Dojo", "teal", "#ff8800", "round", "friendly", "modern"));
    assertThat(source.current()).isEqualTo(ShellTheme.stock("Next"));
  }
}
