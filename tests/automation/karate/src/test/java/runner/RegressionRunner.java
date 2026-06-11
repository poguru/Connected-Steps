package runner;

import com.intuit.karate.junit5.Karate;
import org.junit.jupiter.api.Tag;

@Tag("regression")
class RegressionRunner {
  @Karate.Test
  Karate testRegression() {
    return Karate.run("classpath:")
      .tags("~@ignore")
      .relativeTo(getClass());
  }
}
