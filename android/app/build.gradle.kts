import java.util.Properties

plugins {
  id("com.android.application")
  id("org.jetbrains.kotlin.android")
}

// 版本号：优先用 CI 传入的 -PversionName/-PversionCode
val appVersionName = (project.findProperty("versionName") as String?) ?: "1.0.0"
val appVersionCode = ((project.findProperty("versionCode") as String?) ?: "1").toInt()

android {
  namespace = "com.dchaenschen.dafeiyu"
  compileSdk = 34

  defaultConfig {
    applicationId = "com.dchaenschen.dafeiyu"
    minSdk = 26
    targetSdk = 34
    versionCode = appVersionCode
    versionName = appVersionName
  }

  signingConfigs {
    // 固定签名：仓库里的 keystore/debug.keystore（由 CI 首次生成并提交），保证可以覆盖安装升级
    create("fixed") {
      val ks = rootProject.file("keystore/debug.keystore")
      if (ks.exists()) {
        storeFile = ks
        storePassword = "android"
        keyAlias = "androiddebugkey"
        keyPassword = "android"
      }
    }
  }

  buildTypes {
    release {
      isMinifyEnabled = false
      isShrinkResources = false
      val fixed = signingConfigs.findByName("fixed")
      signingConfig = if (fixed?.storeFile != null) fixed else signingConfigs.getByName("debug")
    }
    debug {
      applicationIdSuffix = ".debug"
      versionNameSuffix = "-debug"
    }
  }

  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  kotlinOptions {
    jvmTarget = "17"
  }

  packaging {
    resources.excludes += setOf("META-INF/*.kotlin_module")
  }
}

dependencies {
  implementation("androidx.appcompat:appcompat:1.7.0")
  implementation("androidx.activity:activity-ktx:1.9.2")
  implementation("androidx.webkit:webkit:1.11.0")
}
