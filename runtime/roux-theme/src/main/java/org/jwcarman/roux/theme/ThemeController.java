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

import jakarta.validation.Valid;

import org.jwcarman.who.spring.security.RequiresPermission;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * {@code GET /api/theme}: the theme, for anyone, signed out too (the page needs it before sign-in).
 * {@code PUT /api/theme}: the owner's change, for whoever holds {@value
 * RouxThemePermissions#THEME_MANAGE}.
 */
@RestController
@RequestMapping(ThemeController.PATH)
public class ThemeController {

  /** Where the API is. */
  public static final String PATH = "/api/theme";

  private final ThemeService themes;

  /** Creates the controller. */
  public ThemeController(ThemeService themes) {
    this.themes = themes;
  }

  @GetMapping
  public ThemeResponse current() {
    return themes.current();
  }

  @PutMapping
  @RequiresPermission(RouxThemePermissions.THEME_MANAGE)
  public ThemeResponse update(@Valid @RequestBody ThemeRequest request) {
    return themes.update(request);
  }
}
