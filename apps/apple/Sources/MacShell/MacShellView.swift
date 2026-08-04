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
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("mac-shell-theme") private var appearance = MacShellAppearance.system.rawValue
    @State private var workspace = MacShellWorkspace()
    @State private var contentSession = MacContentSession()
    @State private var searchFocusRequest = 0
    @State private var showsDeleteConfirmation = false

    private var selectedAppearance: MacShellAppearance {
        MacShellAppearance(rawValue: appearance) ?? .system
    }

    private var activeColorScheme: ColorScheme {
        selectedAppearance.colorScheme ?? systemColorScheme
    }

    private var activeTab: MacShellTab? {
        workspace.activeTab
    }

    private var sectionBinding: Binding<MacShellSection?> {
        Binding(
            get: { activeTab?.section },
            set: { section in
                saveActiveContentState()
                workspace.updateActive {
                    $0.section = section
                    $0.selectedItemID = nil
                    $0.searchQuery = ""
                }
                restoreActiveContentState()
            }
        )
    }

    private func saveActiveContentState() {
        guard let content = contentSession.content, let section = activeTab?.section else { return }
        workspace.updateActive {
            switch section {
            case .clips:
                $0.selectedItemID = content.selectedClipID
                $0.searchQuery = content.clipSearch
            case .feeds:
                $0.selectedItemID = content.selectedEntryID
                $0.searchQuery = content.entrySearch
            default:
                break
            }
        }
    }

    private func restoreActiveContentState() {
        guard let content = contentSession.content, let tab = activeTab else { return }
        switch tab.section {
        case .clips:
            content.selectedClipID = tab.selectedItemID
            Task { await content.updateClipSearch(tab.searchQuery) }
        case .feeds:
            content.selectedEntryID = tab.selectedItemID
            Task { await content.updateEntrySearch(tab.searchQuery) }
        default:
            break
        }
    }

    private func activateTab(_ id: MacShellTab.ID) {
        saveActiveContentState()
        workspace.activate(id)
        restoreActiveContentState()
    }

    private func closeTab(_ id: MacShellTab.ID) {
        saveActiveContentState()
        workspace.close(id)
        restoreActiveContentState()
    }

    private func addTab() {
        saveActiveContentState()
        workspace.addTab()
        restoreActiveContentState()
    }

    private func cycleTabs(forward: Bool) {
        saveActiveContentState()
        workspace.cycle(forward: forward)
        restoreActiveContentState()
    }

    private func activateTab(position: Int) {
        saveActiveContentState()
        workspace.activate(position: position)
        restoreActiveContentState()
    }

    var body: some View {
        VStack(spacing: 0) {
            tabStrip
            Divider().overlay(MacShellPalette.line(for: activeColorScheme))
            if activeTab != nil {
                splitView
            } else {
                ContentUnavailableView("No workspace tabs", systemImage: "rectangle.stack.badge.plus", description: Text("Create a workspace tab to continue."))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .tint(MacShellPalette.text(for: activeColorScheme))
        .preferredColorScheme(selectedAppearance.colorScheme)
        .background(MacShellPalette.canvas(for: activeColorScheme))
        .toolbar { toolbarContent }
        .frame(minWidth: 990, minHeight: 480)
        .task { await contentSession.start() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { contentSession.didBecomeActive() }
        }
        .alert("Delete this clip?", isPresented: $showsDeleteConfirmation) {
            Button("Delete", role: .destructive) {
                if let content = contentSession.content {
                    Task { await content.deleteSelectedClip() }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("The clip is removed from this Mac immediately and synced as a soft delete when possible.")
        }
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
            Button { addTab() } label: {
                Label("New tab", systemImage: "plus")
            }
            .buttonStyle(.borderless)
            .help("New tab")

            Divider().frame(height: 18)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 4) {
                    ForEach(workspace.tabs) { tab in tabButton(tab) }
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
            Button { activateTab(tab.id) } label: {
                Label(tab.title, systemImage: tab.symbol).lineLimit(1)
            }
            .buttonStyle(.plain)

            Button { closeTab(tab.id) } label: {
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
        List(selection: sectionBinding) {
            ForEach(MacShellSection.allCases) { section in
                Label(section.title, systemImage: section.symbol).tag(section)
            }

            if activeTab?.section == .feeds, let content = contentSession.content {
                Section("Subscriptions") {
                    ForEach(content.feeds, id: \.id) { feed in
                        Button {
                            Task { await content.selectFeed(feed.id) }
                        } label: {
                            Label(feed.title, systemImage: "dot.radiowaves.left.and.right")
                                .lineLimit(1)
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(feed.id == content.selectedFeedID ? MacShellPalette.text(for: activeColorScheme) : MacShellPalette.secondaryText(for: activeColorScheme))
                        .accessibilityLabel("Show \(feed.title)")
                    }
                    if content.hasMoreFeeds {
                        Button("Load more subscriptions") { Task { await content.loadMoreFeeds() } }
                    }
                }
            }
        }
        .navigationTitle("mewmo")
        .scrollContentBackground(.hidden)
        .background(MacShellPalette.surface(for: activeColorScheme))
        .navigationSplitViewColumnWidth(min: 180, ideal: 206, max: 260)
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private var listColumn: some View {
        if let content = contentSession.content {
            switch activeTab?.section {
            case .clips:
                MacClipsListColumn(content: content, colorScheme: activeColorScheme, imagePipeline: contentSession.imagePipeline, focusRequest: searchFocusRequest)
            case .feeds:
                MacFeedsListColumn(content: content, colorScheme: activeColorScheme, imagePipeline: contentSession.imagePipeline, focusRequest: searchFocusRequest)
            default:
                MacContentStateView(state: contentSession.state)
            }
        } else {
            MacContentStateView(state: contentSession.state)
        }
    }

    @ViewBuilder
    private var detailColumn: some View {
        if let content = contentSession.content {
            MacContentDetailColumn(section: activeTab?.section, content: content, colorScheme: activeColorScheme, imagePipeline: contentSession.imagePipeline)
        } else {
            MacContentStateView(state: contentSession.state)
        }
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItemGroup(placement: .primaryAction) {
            Button { addTab() } label: {
                Label("New tab", systemImage: "plus")
            }
            .keyboardShortcut("t", modifiers: .command)

            Button {
                if let activeID = workspace.activeTabID { closeTab(activeID) }
            } label: {
                Label("Close tab", systemImage: "xmark")
            }
            .keyboardShortcut("w", modifiers: .command)
            .disabled(activeTab == nil)

            Button {
                if activeTab == nil { addTab() }
                saveActiveContentState()
                workspace.updateActive { $0.section = .clips }
                restoreActiveContentState()
            } label: {
                Label("Show clips", systemImage: "paperclip")
            }
            .keyboardShortcut("n", modifiers: .command)

            Button { searchFocusRequest += 1 } label: {
                Label("Search", systemImage: "magnifyingglass")
            }
            .keyboardShortcut("f", modifiers: .command)

            Button {
                Task { await contentSession.content?.synchronize() }
            } label: {
                Label("Sync", systemImage: "arrow.clockwise")
            }
            .keyboardShortcut("r", modifiers: .command)
            .disabled(contentSession.content == nil)

            if activeTab?.section == .clips, contentSession.content?.selectedClip != nil {
                Button { showsDeleteConfirmation = true } label: {
                    Label("Delete clip", systemImage: "trash")
                }
                .keyboardShortcut(.delete, modifiers: .command)
            }

            Menu {
                Button("Next tab") { cycleTabs(forward: true) }
                    .keyboardShortcut(.tab, modifiers: .control)
                Button("Previous tab") { cycleTabs(forward: false) }
                    .keyboardShortcut(.tab, modifiers: [.control, .shift])
                Divider()
                Button("Switch to tab 1") { activateTab(position: 1) }.keyboardShortcut("1", modifiers: .command)
                Button("Switch to tab 2") { activateTab(position: 2) }.keyboardShortcut("2", modifiers: .command)
                Button("Switch to tab 3") { activateTab(position: 3) }.keyboardShortcut("3", modifiers: .command)
                Button("Switch to tab 4") { activateTab(position: 4) }.keyboardShortcut("4", modifiers: .command)
                Button("Switch to tab 5") { activateTab(position: 5) }.keyboardShortcut("5", modifiers: .command)
                Button("Switch to tab 6") { activateTab(position: 6) }.keyboardShortcut("6", modifiers: .command)
                Button("Switch to tab 7") { activateTab(position: 7) }.keyboardShortcut("7", modifiers: .command)
                Button("Switch to tab 8") { activateTab(position: 8) }.keyboardShortcut("8", modifiers: .command)
                Button("Switch to tab 9") { activateTab(position: 9) }.keyboardShortcut("9", modifiers: .command)
            } label: {
                Label("Tabs", systemImage: "rectangle.stack")
            }

            Menu {
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

private struct MacContentStateView: View {
    let state: MacContentSession.State

    var body: some View {
        switch state {
        case .loading:
            ProgressView("Opening local library")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case .signedOut:
            ContentUnavailableView("Sign in required", systemImage: "person.crop.circle", description: Text("This Mac keeps browsing data in the account recovered from the native session."))
        case .unavailable:
            ContentUnavailableView("Local library unavailable", systemImage: "exclamationmark.triangle", description: Text("Existing data was left untouched. Retry after storage is available."))
        case .ready:
            ContentUnavailableView("Choose Clips or Feeds", systemImage: "sidebar.left", description: Text("Use the sidebar to browse local content."))
        }
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
