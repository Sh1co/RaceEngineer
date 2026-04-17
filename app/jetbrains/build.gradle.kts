plugins {
  id("java")
  id("org.jetbrains.kotlin.jvm") version "1.9.25"
  id("org.jetbrains.intellij") version "1.17.4"
}

group = "com.raceengineer"
version = "0.1.0-eap"

repositories {
  mavenCentral()
}

java {
  toolchain {
    languageVersion.set(JavaLanguageVersion.of(17))
  }
}

kotlin {
  jvmToolchain(17)
}

dependencies {
  implementation("com.squareup.okhttp3:okhttp:4.12.0")
  implementation("com.fasterxml.jackson.module:jackson-module-kotlin:2.17.2")

  testImplementation(kotlin("test"))
  testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
}

intellij {
  version.set("2023.3")
  type.set("RD")
}

tasks {
  patchPluginXml {
    sinceBuild.set("233")
    untilBuild.set("242.*")
  }

  withType<Test> {
    useJUnitPlatform()
  }
}
