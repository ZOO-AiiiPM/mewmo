#if os(macOS)
import SwiftUI

enum MacShellSection: String, CaseIterable, Identifiable {
    case home
    case notes
    case clips
    case feeds

    var id: Self { self }

    var title: String { rawValue.capitalized }

    var symbol: String {
        switch self {
        case .home: "square.grid.2x2"
        case .notes: "note.text"
        case .clips: "paperclip"
        case .feeds: "dot.radiowaves.left.and.right"
        }
    }
}

enum MacShellPreviewState: String, CaseIterable, Identifiable {
    case loaded
    case loading
    case empty

    var id: Self { self }

    var title: String { rawValue.capitalized }
}

enum MacShellAppearance: String, CaseIterable, Identifiable {
    case system
    case light
    case dark

    var id: Self { self }

    var title: String { rawValue.capitalized }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}

struct MacShellItem: Hashable, Identifiable {
    let id: String
    let title: String
    let summary: String
    let metadata: String
}

enum MacShellPreview {
    static let items = [
        MacShellItem(id: "daily", title: "Daily review", summary: "A local preview of the reading surface.", metadata: "Today"),
        MacShellItem(id: "research", title: "Design references", summary: "A local list item with a concise summary.", metadata: "Yesterday"),
        MacShellItem(id: "inbox", title: "Reading inbox", summary: "A placeholder for future synced content.", metadata: "Jul 31")
    ]
}

enum MacShellPalette {
    static let darkCanvas: UInt32 = 0x232327
    static let darkSurface: UInt32 = 0x161719
    static let darkSelected: UInt32 = 0x2E2F34
    static let darkText: UInt32 = 0xEDEDF1
    static let darkSecondaryText: UInt32 = 0x9A9AA1
    static let darkLine: UInt32 = 0x494A52

    static let lightCanvas: UInt32 = 0xF7F7F7
    static let lightSurface: UInt32 = 0xFFFFFF
    static let lightSelected: UInt32 = 0xE8E8E8
    static let lightText: UInt32 = 0x1D1D1F
    static let lightSecondaryText: UInt32 = 0x5E5E64
    static let lightLine: UInt32 = 0xD8D8D8

    static let neutralTokens = [
        darkCanvas, darkSurface, darkSelected, darkText, darkSecondaryText, darkLine,
        lightCanvas, lightSurface, lightSelected, lightText, lightSecondaryText, lightLine
    ]

    static func canvas(for scheme: ColorScheme) -> Color {
        Color(rgb: scheme == .dark ? darkCanvas : lightCanvas)
    }

    static func surface(for scheme: ColorScheme) -> Color {
        Color(rgb: scheme == .dark ? darkSurface : lightSurface)
    }

    static func selected(for scheme: ColorScheme) -> Color {
        Color(rgb: scheme == .dark ? darkSelected : lightSelected)
    }

    static func text(for scheme: ColorScheme) -> Color {
        Color(rgb: scheme == .dark ? darkText : lightText)
    }

    static func secondaryText(for scheme: ColorScheme) -> Color {
        Color(rgb: scheme == .dark ? darkSecondaryText : lightSecondaryText)
    }

    static func line(for scheme: ColorScheme) -> Color {
        Color(rgb: scheme == .dark ? darkLine : lightLine)
    }
}

struct MacShellView: View {
    @Environment(\.colorScheme) private var systemColorScheme
    @AppStorage("mac-shell-theme") private var appearance = MacShellAppearance.system.rawValue
    @FocusState private var searchIsFocused: Bool
    @State private var workspace = MacShellWorkspace(initialSelectedItemID: MacShellPreview.items.first?.id)
    @State private var previewState = MacShellPreviewState.loaded

    private var selectedAppearance: MacShellAppearance {
        MacShellAppearance(rawValue: appearance) ?? .system
    }

    private var activeColorScheme: ColorScheme {
        selectedAppearance.colorScheme ?? systemColorScheme
    }

    private var activeTab: MacShellTab? {
        workspace.activeTab
    }

    private var displayedItems: [MacShellItem] {
        let searchQuery = activeTab?.searchQuery ?? ""
        guard !searchQuery.isEmpty else { return MacShellPreview.items }
        return MacShellPreview.items.filter {
            $0.title.localizedCaseInsensitiveContains(searchQuery)
                || $0.summary.localizedCaseInsensitiveContains(searchQuery)
        }
    }

    private var selectedItem: MacShellItem? {
        MacShellPreview.items.first { $0.id == activeTab?.selectedItemID }
    }

    private var sectionBinding: Binding<MacShellSection?> {
        Binding(
            get: { activeTab?.section },
            set: { section in workspace.updateActive { $0.section = section } }
        )
    }

    private var itemSelectionBinding: Binding<String?> {
        Binding(
            get: { activeTab?.selectedItemID },
            set: { itemID in workspace.updateActive { $0.selectedItemID = itemID } }
        )
    }

    private var searchBinding: Binding<String> {
        Binding(
            get: { activeTab?.searchQuery ?? "" },
            set: { query in workspace.updateActive { $0.searchQuery = query } }
        )
    }

    private func showLocalPreview() {
        if activeTab == nil {
            workspace.addTab()
        }
        previewState = .loaded
        workspace.updateActive { $0.selectedItemID = MacShellPreview.items.first?.id }
    }

    var body: some View {
        VStack(spacing: 0) {
            tabStrip
            Divider()
                .overlay(MacShellPalette.line(for: activeColorScheme))

            if activeTab != nil {
                splitView
            } else {
                ContentUnavailableView("No workspace tabs", systemImage: "rectangle.stack.badge.plus", description: Text("Create a local workspace tab to continue."))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .tint(MacShellPalette.text(for: activeColorScheme))
        .preferredColorScheme(selectedAppearance.colorScheme)
        .background(MacShellPalette.canvas(for: activeColorScheme))
        .toolbar { toolbarContent }
        .frame(minWidth: 990, minHeight: 480)
    }

    private var splitView: some View {
        NavigationSplitView {
            sidebar
        } content: {
            listColumn
        } detail: {
            detailColumn
        }
        .navigationSplitViewStyle(.balanced)
    }

    private var tabStrip: some View {
        HStack(spacing: 8) {
            Button {
                workspace.addTab()
            } label: {
                Label("New tab", systemImage: "plus")
            }
            .buttonStyle(.borderless)
            .help("New tab")

            Divider()
                .frame(height: 18)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 4) {
                    ForEach(workspace.tabs) { tab in
                        tabButton(tab)
                    }
                }
            }
        }
        .padding(.horizontal, 8)
        .frame(height: 36)
        .background(MacShellPalette.surface(for: activeColorScheme))
        .accessibilityElement(children: .contain)
    }

    private func tabButton(_ tab: MacShellTab) -> some View {
        HStack(spacing: 4) {
            Button {
                workspace.activate(tab.id)
            } label: {
                Label(tab.title, systemImage: tab.symbol)
                    .lineLimit(1)
            }
            .buttonStyle(.plain)

            Button {
                workspace.close(tab.id)
            } label: {
                Image(systemName: "xmark.circle.fill")
            }
            .buttonStyle(.borderless)
            .help("Close \(tab.title)")
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(
            RoundedRectangle(cornerRadius: 5)
                .fill(tab.id == workspace.activeTabID ? MacShellPalette.selected(for: activeColorScheme) : .clear)
        )
    }

    private var sidebar: some View {
        List(MacShellSection.allCases, selection: sectionBinding) { section in
            Label(section.title, systemImage: section.symbol)
                .tag(section)
        }
        .navigationTitle("mewmo")
        .scrollContentBackground(.hidden)
        .background(MacShellPalette.surface(for: activeColorScheme))
        .navigationSplitViewColumnWidth(min: 180, ideal: 206, max: 260)
        .accessibilityElement(children: .contain)
    }

    private var listColumn: some View {
        VStack(spacing: 0) {
            TextField("Search local preview", text: searchBinding)
                .textFieldStyle(.roundedBorder)
                .focused($searchIsFocused)
                .padding(12)

            Divider()
                .overlay(MacShellPalette.line(for: activeColorScheme))

            listBody
        }
        .navigationTitle(activeTab?.section?.title ?? "Workspace")
        .background(MacShellPalette.surface(for: activeColorScheme))
        .navigationSplitViewColumnWidth(min: 260, ideal: 312, max: 360)
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private var listBody: some View {
        switch previewState {
        case .loaded:
            List(displayedItems, selection: itemSelectionBinding) { item in
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.title)
                        .font(.headline)
                    Text(item.summary)
                        .font(.callout)
                        .foregroundStyle(MacShellPalette.secondaryText(for: activeColorScheme))
                        .lineLimit(2)
                    Text(item.metadata)
                        .font(.caption)
                        .foregroundStyle(MacShellPalette.secondaryText(for: activeColorScheme))
                }
                .padding(.vertical, 4)
                .tag(item.id)
                .accessibilityElement(children: .combine)
            }
            .scrollContentBackground(.hidden)
            .background(MacShellPalette.surface(for: activeColorScheme))
        case .loading:
            MacShellListSkeleton()
        case .empty:
            ContentUnavailableView("No local preview", systemImage: "tray", description: Text("Choose Loaded from the view menu."))
        }
    }

    @ViewBuilder
    private var detailColumn: some View {
        switch previewState {
        case .loading:
            MacShellDetailSkeleton()
        case .empty:
            ContentUnavailableView("Nothing selected", systemImage: "doc.text", description: Text("The local preview has no items."))
        case .loaded:
            if let selectedItem {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        Text(selectedItem.title)
                            .font(.title2.weight(.semibold))
                        Text(selectedItem.summary)
                            .font(.body)
                            .foregroundStyle(MacShellPalette.secondaryText(for: activeColorScheme))
                        Divider()
                            .overlay(MacShellPalette.line(for: activeColorScheme))
                        Text("This macOS Shell uses local preview data only. Content, repositories, authentication, and sync are intentionally deferred.")
                            .font(.body)
                            .foregroundStyle(MacShellPalette.text(for: activeColorScheme))
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(28)
                }
            } else {
                ContentUnavailableView("Select an item", systemImage: "sidebar.right", description: Text("Choose an item from the local preview list."))
            }
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItemGroup(placement: .primaryAction) {
            Button {
                workspace.addTab()
            } label: {
                Label("New tab", systemImage: "plus")
            }
            .keyboardShortcut("t", modifiers: .command)

            Button {
                workspace.closeActiveTab()
            } label: {
                Label("Close tab", systemImage: "xmark")
            }
            .keyboardShortcut("w", modifiers: .command)
            .disabled(activeTab == nil)

            Button {
                showLocalPreview()
            } label: {
                Label("New local preview", systemImage: "square.and.pencil")
            }
            .keyboardShortcut("n", modifiers: .command)

            Button {
                searchIsFocused = true
            } label: {
                Label("Search", systemImage: "magnifyingglass")
            }
            .keyboardShortcut("f", modifiers: .command)

            Menu {
                Button("Next tab") {
                    workspace.cycle(forward: true)
                }
                .keyboardShortcut(.tab, modifiers: .control)

                Button("Previous tab") {
                    workspace.cycle(forward: false)
                }
                .keyboardShortcut(.tab, modifiers: [.control, .shift])

                Divider()

                Button("Switch to tab 1") { workspace.activate(position: 1) }
                    .keyboardShortcut("1", modifiers: .command)
                Button("Switch to tab 2") { workspace.activate(position: 2) }
                    .keyboardShortcut("2", modifiers: .command)
                Button("Switch to tab 3") { workspace.activate(position: 3) }
                    .keyboardShortcut("3", modifiers: .command)
                Button("Switch to tab 4") { workspace.activate(position: 4) }
                    .keyboardShortcut("4", modifiers: .command)
                Button("Switch to tab 5") { workspace.activate(position: 5) }
                    .keyboardShortcut("5", modifiers: .command)
                Button("Switch to tab 6") { workspace.activate(position: 6) }
                    .keyboardShortcut("6", modifiers: .command)
                Button("Switch to tab 7") { workspace.activate(position: 7) }
                    .keyboardShortcut("7", modifiers: .command)
                Button("Switch to tab 8") { workspace.activate(position: 8) }
                    .keyboardShortcut("8", modifiers: .command)
                Button("Switch to tab 9") { workspace.activate(position: 9) }
                    .keyboardShortcut("9", modifiers: .command)
            } label: {
                Label("Tabs", systemImage: "rectangle.stack")
            }

            Menu {
                Picker("Preview state", selection: $previewState) {
                    ForEach(MacShellPreviewState.allCases) { state in
                        Text(state.title).tag(state)
                    }
                }

                Divider()

                Picker("Appearance", selection: $appearance) {
                    ForEach(MacShellAppearance.allCases) { option in
                        Text(option.title).tag(option.rawValue)
                    }
                }
            } label: {
                Label("View options", systemImage: "slider.horizontal.3")
            }
        }
    }
}

private struct MacShellListSkeleton: View {
    var body: some View {
        List(0..<6, id: \.self) { _ in
            VStack(alignment: .leading, spacing: 8) {
                Capsule().frame(width: 128, height: 14)
                Capsule().frame(maxWidth: .infinity, minHeight: 10, maxHeight: 10)
                Capsule().frame(width: 52, height: 9)
            }
            .redacted(reason: .placeholder)
            .padding(.vertical, 6)
        }
        .disabled(true)
        .accessibilityLabel("Loading local preview")
    }
}

private struct MacShellDetailSkeleton: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Loading local preview")
                .font(.title2)
            Text("A placeholder detail surface keeps the three-column layout stable while local preview content loads.")
            Divider()
            Text("Placeholder detail content")
        }
        .redacted(reason: .placeholder)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(28)
        .accessibilityLabel("Loading detail preview")
    }
}

private extension Color {
    init(rgb: UInt32) {
        self.init(
            .sRGB,
            red: Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8) & 0xFF) / 255,
            blue: Double(rgb & 0xFF) / 255,
            opacity: 1
        )
    }
}
#endif
