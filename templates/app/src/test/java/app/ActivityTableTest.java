package app;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.jwcarman.roux.test.AppTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/** The app keeps no activity table of its own: its history is in roux_activity. */
@AppTest
class ActivityTableTest {

  @Autowired JdbcTemplate jdbc;

  @Test
  void thereIsNoActivityTableOfItsOwn() {
    assertThat(jdbc.queryForObject("select to_regclass('activity')::text", String.class)).isNull();
  }
}
