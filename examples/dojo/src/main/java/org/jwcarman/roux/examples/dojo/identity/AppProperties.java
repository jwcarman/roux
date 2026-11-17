package org.jwcarman.roux.examples.dojo.identity;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The app's own settings.
 *
 * @param ownerEmail the address of the first OWNER (required)
 * @param ownerName the first OWNER's display name (required; stripped)
 * @param baseUrl the app's public base URL
 */
@ConfigurationProperties("app")
public record AppProperties(String ownerEmail, String ownerName, String baseUrl) {

  public AppProperties {
    if (ownerEmail == null || ownerEmail.isBlank()) {
      throw new IllegalArgumentException("app.owner-email must be set to the owner's address");
    }
    if (ownerName == null || ownerName.isBlank()) {
      throw new IllegalArgumentException("app.owner-name must be set to the owner's name");
    }
    ownerName = ownerName.strip();
  }
}
