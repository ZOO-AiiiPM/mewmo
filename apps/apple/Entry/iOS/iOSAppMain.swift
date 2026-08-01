import SwiftUI

/// iOS composition root（仅 iOS target 编译；iPhone + iPad 通用）。
@main
struct MewmoIOSApp: App {
    var body: some Scene {
        WindowGroup {
            MewmoRootView()
        }
    }
}
