package org.jwcarman.roux.examples.dojo;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/** The dojo's own activity table moved into roux's, then went. */
@AppTest
class ActivityMigrationTest {

  @Autowired JdbcTemplate jdbc;

  @Test
  void theOldTableIsGone() {
    assertThat(jdbc.queryForObject("select to_regclass('activity')::text", String.class)).isNull();
  }
}
