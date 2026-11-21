package app;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.jwcarman.roux.test.AppTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.core.env.Environment;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

@AppTest
class AppTests {

  @Autowired JdbcTemplate jdbc;
  @Autowired MockMvc mvc;
  @Autowired Environment env;
  @Autowired ApplicationContext context;

  @Test
  void contextStartsAndSchemaExists() {
    List<String> tables =
        jdbc.queryForList(
            "select table_name from information_schema.tables where table_schema = 'public'",
            String.class);
    assertThat(tables)
        .contains("who_identity", "who_role", "who_email_credential", "who_passkey_credential");
  }

  @Test
  void virtualThreadsAreOn() throws Exception {
    assertThat(env.getProperty("spring.threads.virtual.enabled", Boolean.class)).isTrue();
    AsyncTaskExecutor executor =
        context.getBean("applicationTaskExecutor", AsyncTaskExecutor.class);
    assertThat(executor.submit(() -> Thread.currentThread().isVirtual()).get()).isTrue();
  }

  @Test
  void apiNeedsSignIn() throws Exception {
    mvc.perform(get("/api/users/me")).andExpect(status().isUnauthorized());
  }
}
