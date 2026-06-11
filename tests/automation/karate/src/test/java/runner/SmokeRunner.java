package runner;

import com.intuit.karate.junit5.Karate;
import org.junit.jupiter.api.Tag;

@Tag("smoke")
class SmokeRunner {
  @Karate.Test
  Karate testSmoke() {
    return Karate.run(
      "classpath:auth/login.feature",
      "classpath:sessions/sessions.feature",
      "classpath:membership/membership.feature",
      "classpath:leaderboard/leaderboard.feature"
    ).tags("@smoke").relativeTo(getClass());
  }
}
