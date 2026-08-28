# iOS Mobile Branch

`ios-mobile` is the long-lived mobile distribution branch. The default branch remains untouched by iOS-only delivery changes.

## Build variants

- **Unsigned**: for TrollStore, jailbreak environments, or later re-signing.
- **Ad-hoc**: for devices included in the provisioning profile.

The Ad-hoc workflow requires these repository secrets:

- `IOS_CERTIFICATE_BASE64`
- `IOS_CERTIFICATE_PASSWORD`
- `IOS_PROVISIONING_PROFILE_BASE64`
- `IOS_TEAM_ID`

The certificate and provisioning profile values must be base64 encoded. The profile must match `dev.cooksleep.gptimageplayground`.

## Upstream updates

The upstream sync workflow runs weekly and can also be triggered manually. It:

1. merges `CookSleep/gpt_image_playground:main` into a temporary branch;
2. runs the web build and tests;
3. opens or updates a pull request into `ios-mobile`;
4. stops on conflicts and uploads a conflict report.

Never auto-merge an upstream PR before the Unsigned IPA workflow and device smoke tests pass.

## Release checklist

1. Merge the reviewed mobile delivery changes into `main`.
2. Create a version tag matching `v*` on `main` (for example, `v0.7.7`).
3. Wait for the Unsigned workflow to finish; it publishes the IPA, `.app.zip`, and build report to a GitHub Release.
4. Install and launch-test the Unsigned IPA in its intended environment.
5. Verify launch, API request, background/resume, photo import, export, and upgrade from the previous IPA.
6. Treat Ad-hoc as optional and manual-only; run it only when signing secrets and registered devices are available.


## Deterministic native configuration

Both IPA workflows generate the Capacitor project from the pinned npm dependencies and then run `scripts/configure-ios.sh`. The script applies version-controlled native settings after every generation:

- iOS 16.0 minimum deployment target;
- app version from `package.json` and build number from GitHub Actions;
- camera, photo-library read, and photo-library save usage descriptions;
- Files app sharing and in-place document access;
- indirect input support;
- non-exempt encryption declaration;
- an app privacy manifest declaring no tracking or collected-data categories.

This keeps upstream synchronization low-conflict while making the generated Xcode project reproducible. The script must pass before either IPA is built.
