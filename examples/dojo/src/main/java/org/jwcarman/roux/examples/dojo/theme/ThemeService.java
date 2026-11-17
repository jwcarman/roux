package org.jwcarman.roux.examples.dojo.theme;

import org.jwcarman.roux.examples.dojo.theme.AppTheme.Settings;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.ImportRuntimeHints;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The app's theme. Its version counts saves: 0 before the first, so a client always saves the theme
 * it last read, and a save made elsewhere in between is not overwritten.
 */
@Service
@Transactional
@ImportRuntimeHints(AppNameRuntimeHints.class)
public class ThemeService {

  private final AppThemeRepository themes;
  private final String defaultAppName;

  public ThemeService(AppThemeRepository themes, @Value("${app.name}") String defaultAppName) {
    this.themes = themes;
    this.defaultAppName = defaultAppName;
  }

  /** The theme as saved, or the defaults with version 0. */
  @Transactional(readOnly = true)
  public Theme current() {
    return themes.findById(AppTheme.ID).map(Theme::of).orElseGet(this::defaults);
  }

  /**
   * Saves these settings, if the theme is still at {@code version}.
   *
   * @throws ObjectOptimisticLockingFailureException if the theme was saved since {@code version}
   */
  public Theme update(Settings settings, long version) {
    AppTheme theme = themes.findById(AppTheme.ID).orElse(null);
    long current = theme == null ? 0 : Theme.of(theme).version();
    if (current != version) {
      throw new ObjectOptimisticLockingFailureException(AppTheme.class, AppTheme.ID);
    }
    if (theme == null) {
      theme = new AppTheme(settings);
    } else {
      theme.change(settings);
    }
    return Theme.of(themes.saveAndFlush(theme));
  }

  private Theme defaults() {
    return new Theme(
        ThemeOptions.DEFAULT_PALETTE,
        ThemeOptions.DEFAULT_BRAND_COLOR,
        ThemeOptions.DEFAULT_SHAPE,
        ThemeOptions.DEFAULT_FONT,
        ThemeOptions.DEFAULT_FONT,
        defaultAppName,
        0);
  }

  /** The theme as the API answers it. */
  public record Theme(
      String palette,
      String brandColor,
      String shape,
      String headingFont,
      String bodyFont,
      String appName,
      long version) {

    /** A saved row's version starts at 0, so the API's is one more: 0 is "never saved". */
    static Theme of(AppTheme theme) {
      return new Theme(
          theme.getPalette(),
          theme.getBrandColor(),
          theme.getShape(),
          theme.getHeadingFont(),
          theme.getBodyFont(),
          theme.getAppName(),
          theme.getVersion() + 1);
    }
  }
}
