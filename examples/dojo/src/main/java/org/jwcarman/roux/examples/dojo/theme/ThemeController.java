package org.jwcarman.roux.examples.dojo.theme;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import org.jwcarman.roux.examples.dojo.identity.AppRoles;
import org.jwcarman.roux.examples.dojo.theme.AppTheme.Settings;
import org.jwcarman.roux.examples.dojo.theme.ThemeService.Theme;
import org.jwcarman.who.spring.security.RequiresPermission;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** The app's theme, for whoever may change how the app looks. */
@RestController
@RequestMapping("/api/theme")
public class ThemeController {

  private final ThemeService themes;

  public ThemeController(ThemeService themes) {
    this.themes = themes;
  }

  @GetMapping
  @RequiresPermission(AppRoles.THEME_MANAGE)
  public Theme current() {
    return themes.current();
  }

  @PutMapping
  @RequiresPermission(AppRoles.THEME_MANAGE)
  public Theme update(@Valid @RequestBody Update request) {
    return themes.update(request.settings(), request.version());
  }

  /** New settings for the theme at {@code version}. */
  public record Update(
      @NotNull @Pattern(regexp = ThemeOptions.PALETTE) String palette,
      @NotNull @Pattern(regexp = ThemeOptions.COLOR) String brandColor,
      @NotNull @Pattern(regexp = ThemeOptions.SHAPE) String shape,
      @NotNull @Pattern(regexp = ThemeOptions.FONT) String headingFont,
      @NotNull @Pattern(regexp = ThemeOptions.FONT) String bodyFont,
      @NotBlank @Size(max = ThemeOptions.MAX_APP_NAME) String appName,
      @NotNull Long version) {

    Settings settings() {
      return new Settings(palette, brandColor, shape, headingFont, bodyFont, appName);
    }
  }
}
