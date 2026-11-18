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

import java.util.UUID;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import org.jwcarman.jpa.spring.audit.AuditableEntity;
import org.jwcarman.roux.spa.ShellTheme;

/**
 * The owner's theme: the one row of {@code roux_theme}, put there by roux-theme's changelog. A part
 * that is {@code null} has not been chosen yet, and the app's {@code roux.theme.*} settings stand
 * for it.
 */
@Entity
@Table(name = "roux_theme")
public class AppTheme extends AuditableEntity {

  /** The id of the one theme. */
  public static final UUID ID = new UUID(0, 1);

  private String appName;
  private String palette;
  private String brandColor;
  private String shape;
  private String headingFont;
  private String bodyFont;

  /** For JPA. */
  protected AppTheme() {}

  /** The theme as the changelog creates it: nothing chosen. */
  AppTheme(UUID id) {
    super(id);
  }

  /** Takes {@code theme} as the owner's choice. */
  void choose(ShellTheme theme) {
    this.appName = theme.appName();
    this.palette = theme.palette();
    this.brandColor = theme.brandColor();
    this.shape = theme.shape();
    this.headingFont = theme.headingFont();
    this.bodyFont = theme.bodyFont();
  }

  /** The theme as it looks now: each part the owner chose, and {@code defaults} for the rest. */
  ShellTheme resolve(ShellTheme defaults) {
    return new ShellTheme(
        or(appName, defaults.appName()),
        or(palette, defaults.palette()),
        or(brandColor, defaults.brandColor()),
        or(shape, defaults.shape()),
        or(headingFont, defaults.headingFont()),
        or(bodyFont, defaults.bodyFont()));
  }

  private static String or(String chosen, String fallback) {
    return chosen != null ? chosen : fallback;
  }
}
