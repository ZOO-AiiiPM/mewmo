import SwiftUI

/// macOS composition root（仅 macOS target 编译）。
@main
struct MewmoMacApp: App {
    var body: some Scene {
        WindowGroup {
            MewmoRootView()
        }
        .windowResizability(.contentMinSize)
    }
}
