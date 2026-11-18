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

/**
 * The theme as the API answers it: every part, the owner's or the app's default, and the {@code
 * version} an edit must send back.
 *
 * @param appName what the app is called
 * @param palette a Chakra palette name, or {@code brand}
 * @param brandColor {@code #} and six hex digits
 * @param shape how round corners are
 * @param headingFont the lettering of headings
 * @param bodyFont the lettering of text
 * @param version the version the theme is at, 0 until the owner first saves it
 */
public record ThemeResponse(
    String appName,
    String palette,
    String brandColor,
    String shape,
    String headingFont,
    String bodyFont,
    long version) {

  static ThemeResponse of(ShellTheme theme, long version) {
    return new ThemeResponse(
        theme.appName(),
        theme.palette(),
        theme.brandColor(),
        theme.shape(),
        theme.headingFont(),
        theme.bodyFont(),
        version);
  }
}
