# Connected Steps — Android APK build script
# Run this AFTER installing Android Studio (https://developer.android.com/studio)
# Usage: .\build-android.ps1          (debug APK)
#        .\build-android.ps1 -release  (release APK — needs keystore)

param([switch]$release)

$root    = $PSScriptRoot
$android = "$root\android"

# ── Locate Android Studio JDK ─────────────────────────────────────────────────
$jdkCandidates = @(
  "C:\Program Files\Android\Android Studio\jbr",
  "C:\Program Files\Android\Android Studio\jre",
  "$env:LOCALAPPDATA\Programs\Android Studio\jbr",
  "$env:JAVA_HOME"
) | Where-Object { $_ -and (Test-Path "$_\bin\java.exe") } | Select-Object -First 1

if (-not $jdkCandidates) {
  Write-Host "ERROR: Android Studio JDK not found. Install Android Studio first." -ForegroundColor Red
  Write-Host "       Download: https://developer.android.com/studio" -ForegroundColor Yellow
  exit 1
}
$env:JAVA_HOME = $jdkCandidates
Write-Host "JAVA_HOME: $env:JAVA_HOME" -ForegroundColor Cyan

# ── Locate Android SDK ────────────────────────────────────────────────────────
$sdkCandidates = @(
  "$env:LOCALAPPDATA\Android\Sdk",
  "$env:ANDROID_HOME",
  "$env:ANDROID_SDK_ROOT"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $sdkCandidates) {
  Write-Host "ERROR: Android SDK not found. Open Android Studio and complete setup wizard first." -ForegroundColor Red
  exit 1
}
$env:ANDROID_HOME     = $sdkCandidates
$env:ANDROID_SDK_ROOT = $sdkCandidates
Write-Host "ANDROID_HOME: $env:ANDROID_HOME" -ForegroundColor Cyan

# ── Sync Capacitor ────────────────────────────────────────────────────────────
Write-Host "`nSyncing Capacitor..." -ForegroundColor Green
Set-Location $root
npx cap sync android
if ($LASTEXITCODE -ne 0) { Write-Host "cap sync failed" -ForegroundColor Red; exit 1 }

# ── Build ─────────────────────────────────────────────────────────────────────
Set-Location $android

if ($release) {
  $keystore = "$root\android\app\release.keystore"
  if (-not (Test-Path $keystore)) {
    Write-Host "`nGenerating release keystore..." -ForegroundColor Green
    & "$env:JAVA_HOME\bin\keytool.exe" `
      -genkeypair -v `
      -keystore $keystore `
      -alias "connected-steps" `
      -keyalg RSA -keysize 2048 -validity 10000 `
      -dname "CN=Connected Steps, OU=App, O=ConnectedSteps, L=India, S=India, C=IN" `
      -storepass "CS@android2026" `
      -keypass  "CS@android2026"
    Write-Host "Keystore created: $keystore" -ForegroundColor Cyan
    Write-Host "IMPORTANT: Back up this keystore — you need it for every future update!" -ForegroundColor Yellow
  }

  # Write signing config into local.properties
  $lp = "$android\local.properties"
  $signingBlock = @"
storeFile=release.keystore
storePassword=CS@android2026
keyAlias=connected-steps
keyPassword=CS@android2026
"@
  Add-Content -Path $lp -Value "`n$signingBlock"

  Write-Host "`nBuilding release APK..." -ForegroundColor Green
  .\gradlew.bat assembleRelease
  $apk = "$android\app\build\outputs\apk\release\app-release.apk"
} else {
  Write-Host "`nBuilding debug APK..." -ForegroundColor Green
  .\gradlew.bat assembleDebug
  $apk = "$android\app\build\outputs\apk\debug\app-debug.apk"
}

if ($LASTEXITCODE -eq 0 -and (Test-Path $apk)) {
  $size = [math]::Round((Get-Item $apk).Length / 1MB, 1)
  Write-Host "`nSUCCESS!" -ForegroundColor Green
  Write-Host "APK: $apk ($size MB)" -ForegroundColor Cyan
  Write-Host "Package: in.connectedsteps.app" -ForegroundColor Cyan
  Write-Host "Version: 1.0 (versionCode: 1)" -ForegroundColor Cyan
} else {
  Write-Host "`nBuild FAILED. Check errors above." -ForegroundColor Red
  exit 1
}
