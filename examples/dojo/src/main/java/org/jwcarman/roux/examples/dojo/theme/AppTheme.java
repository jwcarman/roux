package org.jwcarman.roux.examples.dojo.theme;

import java.util.Locale;
import java.util.UUID;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;

import org.jwcarman.jpa.spring.audit.AuditableEntity;

import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** How the app looks, as the owner chose it. There is at most one, with the id {@link #ID}. */
@Entity
@Table(name = "app_theme")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AppTheme extends AuditableEntity {

  /** The id of the one theme. */
  public static final UUID ID = new UUID(0, 1);

  private String palette;
  private String brandColor;
  private String shape;
  private String headingFont;
  private String bodyFont;
  private String appName;

  /** The theme with these settings; see {@link #change}. */
  AppTheme(Settings settings) {
    super(ID);
    change(settings);
  }

  /**
   * Takes these settings. The brand color is kept in lower case and the name stripped; the values
   * were validated against {@link ThemeOptions} on the way in.
   */
  void change(Settings settings) {
    this.palette = settings.palette();
    this.brandColor = settings.brandColor().toLowerCase(Locale.ROOT);
    this.shape = settings.shape();
    this.headingFont = settings.headingFont();
    this.bodyFont = settings.bodyFont();
    this.appName = settings.appName().strip();
  }

  /** A theme's settings, without its version. */
  public record Settings(
      String palette,
      String brandColor,
      String shape,
      String headingFont,
      String bodyFont,
      String appName) {}
}
