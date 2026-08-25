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

1. Merge a reviewed upstream sync PR.
2. Run the Unsigned workflow.
3. Install and launch-test the unsigned build in its intended environment.
4. Run the Ad-hoc workflow when signing secrets and registered devices are available.
5. Verify launch, API request, background/resume, photo import, export, and upgrade from the previous IPA.
