package com.raceengineer.jetbrains.service

import java.nio.file.Files
import java.nio.file.Path
import kotlin.io.path.createDirectories
import kotlin.io.path.writeText
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class WorkspaceContextResolverTest {
  private lateinit var root: Path
  private val resolver = WorkspaceContextResolver(maxDepth = 8)

  @BeforeTest
  fun setup() {
    root = Files.createTempDirectory("raceengineer-workspace-test")
  }

  @AfterTest
  fun cleanup() {
    if (::root.isInitialized) {
      root.toFile().deleteRecursively()
    }
  }

  @Test
  fun `finds mentioned file names and path mentions while skipping ignored folders`() {
    val srcDir = root.resolve("src").createDirectories()
    val nestedDir = srcDir.resolve("feature").createDirectories()
    val ignoredDir = root.resolve("node_modules").createDirectories()

    val userPath = srcDir.resolve("UserService.cs")
    val orderPath = nestedDir.resolve("OrderService.cs")
    val ignoredPath = ignoredDir.resolve("UserService.cs")
    userPath.writeText("class UserService {}")
    orderPath.writeText("class OrderService {}")
    ignoredPath.writeText("class Ignored {}")

    val results = resolver.findMentionedFiles(
      root = root,
      userMessage = "Check src/feature/OrderService.cs and UserService.cs",
      maxFiles = 5,
    )

    val relativePaths = results.map { root.relativize(it).toString().replace('\\', '/') }.toSet()
    assertTrue(relativePaths.contains("src/UserService.cs"))
    assertTrue(relativePaths.contains("src/feature/OrderService.cs"))
    assertFalse(relativePaths.contains("node_modules/UserService.cs"))
  }

  @Test
  fun `snippet reader caps large files`() {
    val file = root.resolve("src").createDirectories().resolve("LargeFile.kt")
    file.writeText("x".repeat(5000))

    val snippet = resolver.readSnippet(file, maxChars = 1000)
    assertEquals(1000, snippet.length)
  }
}
