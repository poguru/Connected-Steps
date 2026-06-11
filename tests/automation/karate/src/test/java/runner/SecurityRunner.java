package runner;

import com.intuit.karate.junit5.Karate;
import org.junit.jupiter.api.Tag;

@Tag("security")
class SecurityRunner {
  @Karate.Test
  Karate testSecurity() {
    return Karate.run("classpath:")
      .tags("@security")
      .relativeTo(getClass());
  }
}
