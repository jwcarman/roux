package app;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;

/** A class's package declaration is its directory: a file moved without its package fails here. */
class PackageLayoutTest {

  private static final Pattern PACKAGE =
      Pattern.compile("^package\\s+([\\w.]+);", Pattern.MULTILINE);

  @Test
  void everyJavaFileDeclaresThePackageOfItsDirectory() throws IOException {
    List<String> misplaced = misplaced(Path.of("src/main/java"), Path.of("src/test/java"));

    assertThat(misplaced).isEmpty();
  }

  private static List<String> misplaced(Path... roots) throws IOException {
    return Stream.of(roots).flatMap(PackageLayoutTest::misplacedUnder).toList();
  }

  private static Stream<String> misplacedUnder(Path root) {
    try (Stream<Path> files = Files.walk(root)) {
      return files
          .filter(file -> file.toString().endsWith(".java"))
          .filter(file -> !declaredPackage(file).equals(directoryPackage(root, file)))
          .map(file -> file + " declares " + declaredPackage(file))
          .toList()
          .stream();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }

  private static String directoryPackage(Path root, Path file) {
    return root.relativize(file.getParent()).toString().replace('/', '.');
  }

  private static String declaredPackage(Path file) {
    try {
      Matcher matcher = PACKAGE.matcher(Files.readString(file));
      return matcher.find() ? matcher.group(1) : "";
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }
}
