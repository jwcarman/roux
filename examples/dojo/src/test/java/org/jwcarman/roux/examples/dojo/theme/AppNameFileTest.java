package org.jwcarman.roux.examples.dojo.theme;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.support.PropertiesLoaderUtils;

/** A new app is named by writing app-name.properties; nothing else may set the name. */
class AppNameFileTest {
  @Test
  void theAppsNameComesFromItsOwnFile() throws IOException {
    var file = PropertiesLoaderUtils.loadProperties(new ClassPathResource("app-name.properties"));
    // The app's name is written here when the app is created, so any name will do.
    assertThat(file.getProperty("app.name")).isNotBlank();

    var yaml = new YamlPropertiesFactoryBean();
    yaml.setResources(new ClassPathResource("application.yml"));
    var application = yaml.getObject();
    assertThat(application).doesNotContainKey("app.name");
    assertThat(application.getProperty("spring.config.import"))
        .isEqualTo("classpath:app-name.properties");
  }
}
