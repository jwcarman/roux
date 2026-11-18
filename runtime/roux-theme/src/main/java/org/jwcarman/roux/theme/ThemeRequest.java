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

import java.util.Locale;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import org.jwcarman.roux.spa.ShellTheme;

/**
 * The owner's new theme, edited from {@code version}. The allowed values are the shell's own
 * ({@link ShellTheme}); the brand colour is kept in lower case and the name stripped.
 *
 * @param appName what the app is called, 1 to {@value ShellTheme#MAX_APP_NAME} characters
 * @param palette a Chakra palette name, or {@code brand}
 * @param brandColor {@code #} and six hex digits
 * @param shape how round corners are
 * @param headingFont the lettering of headings
 * @param bodyFont the lettering of text
 * @param version the version the owner read
 */
public record ThemeRequest(
    @NotBlank @Size(max = ShellTheme.MAX_APP_NAME) String appName,
    @NotNull @Pattern(regexp = ShellTheme.PALETTES) String palette,
    @NotNull @Pattern(regexp = ShellTheme.COLOR) String brandColor,
    @NotNull @Pattern(regexp = ShellTheme.SHAPES) String shape,
    @NotNull @Pattern(regexp = ShellTheme.FONTS) String headingFont,
    @NotNull @Pattern(regexp = ShellTheme.FONTS) String bodyFont,
    @NotNull Long version) {

  ShellTheme theme() {
    return new ShellTheme(
        appName.strip(),
        palette,
        brandColor.toLowerCase(Locale.ROOT),
        shape,
        headingFont,
        bodyFont);
  }
}
