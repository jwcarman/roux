package org.jwcarman.roux.examples.dojo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration;

// who signs people in without a UserDetailsService, but nothing makes Spring Boot's in-memory user
// back off, so Boot would make one and log its generated password. Nothing signs in with it.
@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
@ConfigurationPropertiesScan
public class DojoApplication {

  public static void main(String[] args) {
    SpringApplication.run(DojoApplication.class, args);
  }
}
