package org.jwcarman.roux.examples.dojo.security;

import org.jwcarman.roux.examples.dojo.web.ContentSecurityPolicy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.HeadersConfigurer;

/**
 * The app's security is who's own chain: email links and passkeys, CSRF for the SPA, and {@code
 * 401} for a signed-out request outside the public paths: the SPA's shell and assets (roux opens
 * them and serves the shell for every client route) and {@code who.security.public-paths}
 * (application.yml), which lists the icons at the root. A new endpoint is private until it is
 * listed there.
 *
 * <p>The app adds one thing to that chain, through a Spring Security customizer bean (which applies
 * to every chain, who's included): the Content-Security-Policy header on every response.
 */
@Configuration
public class SecurityConfig {

  @Bean
  Customizer<HeadersConfigurer<HttpSecurity>> contentSecurityPolicy() {
    return headers -> headers.addHeaderWriter(ContentSecurityPolicy.headerWriter());
  }
}
