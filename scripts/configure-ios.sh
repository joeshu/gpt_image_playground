#!/usr/bin/env bash
set -euo pipefail

APP_DIR="ios/App/App"
PLIST_PATH="$APP_DIR/Info.plist"
PROJECT_PATH="ios/App/App.xcodeproj/project.pbxproj"
PRIVACY_PATH="$APP_DIR/PrivacyInfo.xcprivacy"
KEYCHAIN_PLUGIN_PATH="$APP_DIR/SecureStoragePlugin.swift"
NATIVE_EXPORT_PLUGIN_PATH="$APP_DIR/NativeExportPlugin.swift"
NATIVE_LIFECYCLE_PLUGIN_PATH="$APP_DIR/NativeLifecyclePlugin.swift"
NATIVE_HAPTICS_PLUGIN_PATH="$APP_DIR/NativeHapticsPlugin.swift"
NATIVE_NOTIFICATIONS_PLUGIN_PATH="$APP_DIR/NativeNotificationsPlugin.swift"
VIEW_CONTROLLER_PATH="$APP_DIR/AppViewController.swift"
STORYBOARD_PATH="$APP_DIR/Base.lproj/Main.storyboard"

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

cat > "$KEYCHAIN_PLUGIN_PATH" <<'SWIFT'
import Capacitor
import Foundation
import Security

@objc(SecureStoragePlugin)
public class SecureStoragePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SecureStoragePlugin"
    public let jsName = "SecureStorage"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]

    private var service: String {
        return (Bundle.main.bundleIdentifier ?? "dev.cooksleep.gptimageplayground") + ".secure-storage"
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty else {
            call.reject("Missing Keychain key")
            return
        }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound {
            call.resolve(["value": NSNull()])
            return
        }
        guard status == errSecSuccess, let data = result as? Data, let value = String(data: data, encoding: .utf8) else {
            call.reject("Keychain read failed: \(status)")
            return
        }
        call.resolve(["value": value])
    }

    @objc func set(_ call: CAPPluginCall) {
        guard
            let key = call.getString("key"), !key.isEmpty,
            let value = call.getString("value")
        else {
            call.reject("Missing Keychain key or value")
            return
        }

        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        let data = Data(value.utf8)
        let updateStatus = SecItemUpdate(query as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if updateStatus == errSecSuccess {
            call.resolve()
            return
        }
        guard updateStatus == errSecItemNotFound else {
            call.reject("Keychain update failed: \(updateStatus)")
            return
        }

        var item = query
        item[kSecValueData as String] = data
        item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let addStatus = SecItemAdd(item as CFDictionary, nil)
        if addStatus == errSecSuccess {
            call.resolve()
        } else {
            call.reject("Keychain write failed: \(addStatus)")
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty else {
            call.reject("Missing Keychain key")
            return
        }

        let status = SecItemDelete([
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ] as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound {
            call.resolve()
        } else {
            call.reject("Keychain delete failed: \(status)")
        }
    }
}
SWIFT

cat > "$NATIVE_EXPORT_PLUGIN_PATH" <<'SWIFT'
import Capacitor
import Foundation
import UIKit

@objc(NativeExportPlugin)
public class NativeExportPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeExportPlugin"
    public let jsName = "NativeExport"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise)
    ]

    @objc func share(_ call: CAPPluginCall) {
        guard
            let base64 = call.getString("base64"),
            let data = Data(base64Encoded: base64),
            let rawFileName = call.getString("fileName")
        else {
            call.reject("Invalid export file")
            return
        }

        let fileName = URL(fileURLWithPath: rawFileName).lastPathComponent
        guard !fileName.isEmpty else {
            call.reject("Invalid export file name")
            return
        }

        do {
            let directory = FileManager.default.temporaryDirectory
                .appendingPathComponent("GPTImagePlaygroundExports", isDirectory: true)
                .appendingPathComponent(UUID().uuidString, isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let fileURL = directory.appendingPathComponent(fileName)
            try data.write(to: fileURL, options: .atomic)

            DispatchQueue.main.async {
                guard let presenter = self.bridge?.viewController else {
                    try? FileManager.default.removeItem(at: directory)
                    call.reject("Native share controller is unavailable")
                    return
                }

                let controller = UIActivityViewController(activityItems: [fileURL], applicationActivities: nil)
                if let popover = controller.popoverPresentationController {
                    popover.sourceView = presenter.view
                    popover.sourceRect = CGRect(
                        x: presenter.view.bounds.midX,
                        y: presenter.view.bounds.maxY,
                        width: 1,
                        height: 1
                    )
                }
                controller.completionWithItemsHandler = { _, completed, _, _ in
                    try? FileManager.default.removeItem(at: directory)
                    call.resolve(["cancelled": !completed])
                }
                presenter.present(controller, animated: true)
            }
        } catch {
            call.reject("Unable to prepare export file: \(error.localizedDescription)")
        }
    }
}
SWIFT

cat > "$NATIVE_LIFECYCLE_PLUGIN_PATH" <<'SWIFT'
import Capacitor
import UIKit

@objc(NativeLifecyclePlugin)
public class NativeLifecyclePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeLifecyclePlugin"
    public let jsName = "NativeLifecycle"
    public let pluginMethods: [CAPPluginMethod] = []
    private var observers: [NSObjectProtocol] = []

    override public func load() {
        let center = NotificationCenter.default
        observers = [
            center.addObserver(
                forName: UIApplication.didBecomeActiveNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.notifyListeners("appStateChange", data: ["isActive": true])
            },
            center.addObserver(
                forName: UIApplication.willResignActiveNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.notifyListeners("appStateChange", data: ["isActive": false])
            },
            center.addObserver(
                forName: UIApplication.didReceiveMemoryWarningNotification,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                self?.notifyListeners("memoryWarning", data: [:])
            }
        ]
    }

    deinit {
        for observer in observers {
            NotificationCenter.default.removeObserver(observer)
        }
    }
}
SWIFT

cat > "$NATIVE_HAPTICS_PLUGIN_PATH" <<'SWIFT'
import Capacitor
import UIKit

@objc(NativeHapticsPlugin)
public class NativeHapticsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeHapticsPlugin"
    public let jsName = "NativeHaptics"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "selection", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "impact", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "notification", returnType: CAPPluginReturnPromise)
    ]

    @objc func selection(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let generator = UISelectionFeedbackGenerator()
            generator.prepare()
            generator.selectionChanged()
            call.resolve()
        }
    }

    @objc func impact(_ call: CAPPluginCall) {
        let style = call.getString("style") == "medium"
            ? UIImpactFeedbackGenerator.FeedbackStyle.medium
            : UIImpactFeedbackGenerator.FeedbackStyle.light
        DispatchQueue.main.async {
            let generator = UIImpactFeedbackGenerator(style: style)
            generator.prepare()
            generator.impactOccurred()
            call.resolve()
        }
    }

    @objc func notification(_ call: CAPPluginCall) {
        let type: UINotificationFeedbackGenerator.FeedbackType
        switch call.getString("type") {
        case "warning": type = .warning
        case "error": type = .error
        default: type = .success
        }
        DispatchQueue.main.async {
            let generator = UINotificationFeedbackGenerator()
            generator.prepare()
            generator.notificationOccurred(type)
            call.resolve()
        }
    }
}
SWIFT

cat > "$NATIVE_NOTIFICATIONS_PLUGIN_PATH" <<'SWIFT'
import Capacitor
import UserNotifications

@objc(NativeNotificationsPlugin)
public class NativeNotificationsPlugin: CAPPlugin, CAPBridgedPlugin, UNUserNotificationCenterDelegate {
    public let identifier = "NativeNotificationsPlugin"
    public let jsName = "NativeNotifications"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "notify", returnType: CAPPluginReturnPromise)
    ]

    override public func load() {
        UNUserNotificationCenter.current().delegate = self
    }

    private func permissionName(_ status: UNAuthorizationStatus) -> String {
        switch status {
        case .authorized, .provisional, .ephemeral: return "granted"
        case .denied: return "denied"
        default: return "default"
        }
    }

    @objc func getPermission(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            call.resolve(["permission": self.permissionName(settings.authorizationStatus)])
        }
    }

    @objc func requestPermission(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if let error = error {
                call.reject("Notification permission failed: \(error.localizedDescription)")
                return
            }
            call.resolve(["permission": granted ? "granted" : "denied"])
        }
    }

    @objc func notify(_ call: CAPPluginCall) {
        guard let title = call.getString("title"), !title.isEmpty else {
            call.reject("Missing notification title")
            return
        }

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = call.getString("body") ?? ""
        content.sound = .default
        if let taskId = call.getString("taskId"), !taskId.isEmpty { content.userInfo["taskId"] = taskId }
        if let conversationId = call.getString("conversationId"), !conversationId.isEmpty { content.userInfo["conversationId"] = conversationId }
        let request = UNNotificationRequest(
            identifier: "task-completion-\(UUID().uuidString)",
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                call.reject("Notification delivery failed: \(error.localizedDescription)")
            } else {
                call.resolve()
            }
        }
    }

    public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let userInfo = response.notification.request.content.userInfo
        notifyListeners("notificationAction", data: [
            "taskId": userInfo["taskId"] as? String ?? "",
            "conversationId": userInfo["conversationId"] as? String ?? ""
        ])
        completionHandler()
    }

    public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .sound])
    }
}
SWIFT

cat > "$VIEW_CONTROLLER_PATH" <<'SWIFT'
import Capacitor
import UIKit

public class AppViewController: CAPBridgeViewController {
    override public func capacitorDidLoad() {
        bridge?.registerPluginInstance(SecureStoragePlugin())
        bridge?.registerPluginInstance(NativeExportPlugin())
        bridge?.registerPluginInstance(NativeLifecyclePlugin())
        bridge?.registerPluginInstance(NativeHapticsPlugin())
        bridge?.registerPluginInstance(NativeNotificationsPlugin())
    }
}
SWIFT

perl -0pi -e 's/customClass="CAPBridgeViewController" customModule="Capacitor"/customClass="AppViewController" customModule="App" customModuleProvider="target"/g' "$STORYBOARD_PATH"
grep -q 'customClass="AppViewController"' "$STORYBOARD_PATH"

ruby <<'RUBY'
require 'xcodeproj'

project = Xcodeproj::Project.open('ios/App/App.xcodeproj')
target = project.targets.find { |item| item.name == 'App' }
raise 'App target not found' unless target

group = project.main_group.find_subpath('App', true)
privacy = group.files.find { |item| item.path == 'PrivacyInfo.xcprivacy' } || group.new_file('PrivacyInfo.xcprivacy')
target.resources_build_phase.add_file_reference(privacy, true) unless target.resources_build_phase.files_references.include?(privacy)

['SecureStoragePlugin.swift', 'NativeExportPlugin.swift', 'NativeLifecyclePlugin.swift', 'NativeHapticsPlugin.swift', 'NativeNotificationsPlugin.swift', 'AppViewController.swift'].each do |path|
  file = group.files.find { |item| item.path == path } || group.new_file(path)
  target.source_build_phase.add_file_reference(file, true) unless target.source_build_phase.files_references.include?(file)
end
project.save
RUBY

/usr/libexec/PlistBuddy -c "Print :CFBundleDisplayName" "$PLIST_PATH"
grep -q "PrivacyInfo.xcprivacy" "$PROJECT_PATH"
grep -q "SecureStoragePlugin.swift" "$PROJECT_PATH"
grep -q "NativeExportPlugin.swift" "$PROJECT_PATH"
grep -q "NativeLifecyclePlugin.swift" "$PROJECT_PATH"
grep -q "NativeHapticsPlugin.swift" "$PROJECT_PATH"
grep -q "NativeNotificationsPlugin.swift" "$PROJECT_PATH"
grep -q "AppViewController.swift" "$PROJECT_PATH"
echo "Configured iOS app version $APP_VERSION ($BUILD_NUMBER), deployment target 16.0 with Keychain storage, native export, lifecycle events, haptic feedback, and native notifications"
