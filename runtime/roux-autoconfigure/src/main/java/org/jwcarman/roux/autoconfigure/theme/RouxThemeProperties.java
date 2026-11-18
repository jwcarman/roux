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
package org.jwcarman.roux.autoconfigure.theme;

import org.jwcarman.roux.spa.ShellTheme;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The app's look before anyone changes it, under {@code roux.theme}: the shell's whole theme when
 * nothing else supplies one, and what roux-theme falls back to for a part its table has not set.
 * Anything left out is Chakra's stock look; the name is {@code spring.application.name}.
 *
 * @param appName what the app is called (the page title and the header); defaults to {@code
 *     spring.application.name}
 * @param palette a Chakra palette, or {@code brand} to generate one from {@code brandColor}
 * @param brandColor {@code #} and six hex digits
 * @param shape how round corners are: square, slight, medium, round or extra-round
 * @param headingFont standard, modern, friendly or classic
 * @param bodyFont standard, modern, friendly or classic
 */
@ConfigurationProperties("roux.theme")
public record RouxThemeProperties(
    String appName,
    @DefaultValue(ShellTheme.STOCK_PALETTE) String palette,
    @DefaultValue(ShellTheme.STOCK_BRAND_COLOR) String brandColor,
    @DefaultValue(ShellTheme.STOCK_SHAPE) String shape,
    @DefaultValue(ShellTheme.STOCK_FONT) String headingFont,
    @DefaultValue(ShellTheme.STOCK_FONT) String bodyFont) {

  /**
   * The theme these settings describe.
   *
   * @param applicationName {@code spring.application.name}, for an app with no {@code appName}
   * @throws IllegalStateException if the app has no name at all, naming the settings that give one
   * @throws IllegalArgumentException for a value the frontend has no look for
   */
  public ShellTheme theme(String applicationName) {
    String name = appName != null ? appName : applicationName;
    if (name == null) {
      throw new IllegalStateException(
          "The app has no name: set roux.theme.app-name or spring.application.name");
    }
    return new ShellTheme(name, palette, brandColor, shape, headingFont, bodyFont);
  }
}
