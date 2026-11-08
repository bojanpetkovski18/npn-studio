# Android build

The Android app is the mobile web app (`mobile/`) wrapped with Capacitor 8. The project lives in `mobile/android`.

## One-time setup (no admin rights needed)

1. **JDK 21** – e.g. Eclipse Temurin 21 (zip). Verify the download's SHA-256 against the publisher's value.
2. **Android command-line tools** – from developer.android.com; verify the checksum listed in Google's repository XML.
3. Install the SDK packages (the newer `sdkmanager` uses `/` separators):

   ```
   sdkmanager --sdk_root=<sdk> --licenses
   sdkmanager --sdk_root=<sdk> "platform-tools" "platforms/android-36" "build-tools/36.1.0"
   # optional, for the emulator test:
   sdkmanager --sdk_root=<sdk> "emulator" "system-images/android-36/google_apis/x86_64"
   avdmanager create avd -n nalogix_test -k "system-images;android-36;google_apis;x86_64" -d pixel_7
   ```

4. Set the environment (see `.env.example`): `JAVA_HOME`, `ANDROID_HOME`.

## Signing key (release builds only)

Create the key once and keep it **outside the repository** (it is git-ignored anyway). **Back it up**: every
future update of the installed app must be signed with the same key, or Android refuses the update.

```
keytool -genkeypair -keystore <outside-repo>/nalogix-release.jks -alias nalogix -keyalg RSA -keysize 4096 -validity 10000
```

Then write `<outside-repo>/nalogix-release.properties` with `storeFile`, `storePassword`, `keyAlias`, `keyPassword`,
and point `NALOGIX_SIGNING` at it.

## Build

```
npm run android:build            # signed release → dist/Nalogix.apk
npm run android:build -- --debug # debug (WebView debuggable) → dist/Nalogix-debug.apk
```

The version (`versionName` / `versionCode`) comes from `package.json`.

## Test on an emulator or a USB phone

```
emulator -avd nalogix_test -no-window -no-audio &       # or plug in a phone with USB debugging on
adb install -r dist/Nalogix-debug.apk                    # uninstall first if a release build is installed
npm run android:test                                      # 16 checks, screenshots in the OS temp folder
```

`adb install` of a build signed with a different key fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`;
uninstall the app first (this deletes its stored data).
