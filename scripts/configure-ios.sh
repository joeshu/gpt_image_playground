#!/usr/bin/env bash
set -euo pipefail

APP_DIR="ios/App/App"
PLIST_PATH="$APP_DIR/Info.plist"
PROJECT_PATH="ios/App/App.xcodeproj/project.pbxproj"
PRIVACY_PATH="$APP_DIR/PrivacyInfo.xcprivacy"

test -f "$PLIST_PATH"
test -f "$PROJECT_PATH"

APP_VERSION="$(node -p "require('./package.json').version")"
BUILD_NUMBER="${GITHUB_RUN_NUMBER:-1}"

/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName GPT Image Playground" "$PLIST_PATH" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :CFBundleDisplayName string GPT Image Playground" "$PLIST_PATH"
/usr/libexec/PlistBuddy -c "Set :NSCameraUsageDescription 用于拍摄并添加参考图片" "$PLIST_PATH" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :NSCameraUsageDescription string 用于拍摄并添加参考图片" "$PLIST_PATH"
/usr/libexec/PlistBuddy -c "Set :NSPhotoLibraryUsageDescription 用于选择生成和编辑所需的图片" "$PLIST_PATH" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :NSPhotoLibraryUsageDescription string 用于选择生成和编辑所需的图片" "$PLIST_PATH"
/usr/libexec/PlistBuddy -c "Set :NSPhotoLibraryAddUsageDescription 用于将生成的图片保存到照片图库" "$PLIST_PATH" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :NSPhotoLibraryAddUsageDescription string 用于将生成的图片保存到照片图库" "$PLIST_PATH"
/usr/libexec/PlistBuddy -c "Set :UIFileSharingEnabled true" "$PLIST_PATH" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :UIFileSharingEnabled bool true" "$PLIST_PATH"
/usr/libexec/PlistBuddy -c "Set :LSSupportsOpeningDocumentsInPlace true" "$PLIST_PATH" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :LSSupportsOpeningDocumentsInPlace bool true" "$PLIST_PATH"
/usr/libexec/PlistBuddy -c "Set :ITSAppUsesNonExemptEncryption false" "$PLIST_PATH" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :ITSAppUsesNonExemptEncryption bool false" "$PLIST_PATH"
/usr/libexec/PlistBuddy -c "Set :UIApplicationSupportsIndirectInputEvents true" "$PLIST_PATH" 2>/dev/null \
  || /usr/libexec/PlistBuddy -c "Add :UIApplicationSupportsIndirectInputEvents bool true" "$PLIST_PATH"

perl -0pi -e "s/IPHONEOS_DEPLOYMENT_TARGET = [^;]+;/IPHONEOS_DEPLOYMENT_TARGET = 16.0;/g" "$PROJECT_PATH"
perl -0pi -e "s/MARKETING_VERSION = [^;]+;/MARKETING_VERSION = $APP_VERSION;/g" "$PROJECT_PATH"
perl -0pi -e "s/CURRENT_PROJECT_VERSION = [^;]+;/CURRENT_PROJECT_VERSION = $BUILD_NUMBER;/g" "$PROJECT_PATH"

cat > "$PRIVACY_PATH" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key>
  <false/>
  <key>NSPrivacyTrackingDomains</key>
  <array/>
  <key>NSPrivacyCollectedDataTypes</key>
  <array/>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>CA92.1</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
EOF

ruby <<'RUBY'
require 'xcodeproj'

project = Xcodeproj::Project.open('ios/App/App.xcodeproj')
target = project.targets.find { |item| item.name == 'App' }
raise 'App target not found' unless target

group = project.main_group.find_subpath('App', true)
file = group.files.find { |item| item.path == 'PrivacyInfo.xcprivacy' } || group.new_file('PrivacyInfo.xcprivacy')
target.resources_build_phase.add_file_reference(file, true) unless target.resources_build_phase.files_references.include?(file)
project.save
RUBY

/usr/libexec/PlistBuddy -c "Print :CFBundleDisplayName" "$PLIST_PATH"
grep -q "PrivacyInfo.xcprivacy" "$PROJECT_PATH"
echo "Configured iOS app version $APP_VERSION ($BUILD_NUMBER), deployment target 16.0"
