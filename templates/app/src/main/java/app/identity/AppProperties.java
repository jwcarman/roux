package app.identity;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The app's own settings. The first owner is roux's: {@code roux.owner.email} and {@code
 * roux.owner.name}.
 *
 * @param baseUrl the app's public base URL
 */
@ConfigurationProperties("app")
public record AppProperties(String baseUrl) {}
