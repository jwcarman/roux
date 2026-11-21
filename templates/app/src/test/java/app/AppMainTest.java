package app;

import static org.mockito.Mockito.mockStatic;

import org.junit.jupiter.api.Test;
import org.mockito.MockedStatic;
import org.springframework.boot.SpringApplication;

/** {@code main} starts the app with its arguments; starting the whole app is AppTests' job. */
class AppMainTest {

  @Test
  void mainRunsTheAppWithItsArguments() {
    String[] args = {"--server.port=0"};
    try (MockedStatic<SpringApplication> spring = mockStatic(SpringApplication.class)) {
      App.main(args);

      spring.verify(() -> SpringApplication.run(App.class, args));
    }
  }
}
