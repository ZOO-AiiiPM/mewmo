import SwiftUI

/// 共享的最小启动壳视图（工程结构与构建矩阵的载体，不含任何业务 UI）。
///
/// macOS 与 iOS target 复用此视图，仅作为工程可编译、可运行的冒烟证明。
/// 平台差异应通过 `#if os(...)` 在此处或后续业务代码内收敛，而非复制代码。
struct MewmoRootView: View {
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "cat.fill")
                .font(.system(size: 56))
                .foregroundStyle(.tint)
            Text("mewmo")
                .font(.largeTitle.bold())
            Text("Apple build matrix · macOS / iPhone / iPad")
                .font(.callout)
                .foregroundStyle(.secondary)
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

#Preview {
    MewmoRootView()
}
