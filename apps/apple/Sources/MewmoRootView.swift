import SwiftUI

struct MewmoRootView: View {
    var body: some View {
#if os(macOS)
        MacShellView()
#else
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
#endif
    }
}

#Preview {
    MewmoRootView()
}
