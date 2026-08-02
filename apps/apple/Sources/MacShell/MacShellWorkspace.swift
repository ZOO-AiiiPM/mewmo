#if os(macOS)
import Foundation

struct MacShellTab: Hashable, Identifiable {
    let id: UUID
    var section: MacShellSection?
    var selectedItemID: String?
    var searchQuery: String

    init(
        id: UUID = UUID(),
        section: MacShellSection? = .home,
        selectedItemID: String? = nil,
        searchQuery: String = ""
    ) {
        self.id = id
        self.section = section
        self.selectedItemID = selectedItemID
        self.searchQuery = searchQuery
    }

    var title: String { section?.title ?? "Workspace" }
    var symbol: String { section?.symbol ?? "square" }
}

struct MacShellWorkspace {
    private(set) var tabs: [MacShellTab]
    private(set) var activeTabID: MacShellTab.ID?

    init(initialSelectedItemID: String? = nil) {
        let initialTab = MacShellTab(selectedItemID: initialSelectedItemID)
        tabs = [initialTab]
        activeTabID = initialTab.id
    }

    var activeTab: MacShellTab? {
        tabs.first { $0.id == activeTabID }
    }

    @discardableResult
    mutating func addTab() -> MacShellTab.ID {
        let tab = MacShellTab()
        tabs.append(tab)
        activeTabID = tab.id
        return tab.id
    }

    mutating func activate(_ id: MacShellTab.ID) {
        guard tabs.contains(where: { $0.id == id }) else { return }
        activeTabID = id
    }

    mutating func close(_ id: MacShellTab.ID) {
        guard let index = tabs.firstIndex(where: { $0.id == id }) else { return }
        let wasActive = activeTabID == id
        tabs.remove(at: index)

        guard wasActive else { return }
        activeTabID = tabs.indices.contains(index) ? tabs[index].id : tabs.last?.id
    }

    mutating func closeActiveTab() {
        guard let activeTabID else { return }
        close(activeTabID)
    }

    mutating func cycle(forward: Bool) {
        guard !tabs.isEmpty else { return }
        guard let activeIndex = tabs.firstIndex(where: { $0.id == activeTabID }) else {
            activeTabID = tabs[0].id
            return
        }

        let nextIndex = forward
            ? (activeIndex + 1) % tabs.count
            : (activeIndex - 1 + tabs.count) % tabs.count
        activeTabID = tabs[nextIndex].id
    }

    mutating func activate(position: Int) {
        let index = position - 1
        guard tabs.indices.contains(index) else { return }
        activeTabID = tabs[index].id
    }

    mutating func updateActive(_ update: (inout MacShellTab) -> Void) {
        guard let index = tabs.firstIndex(where: { $0.id == activeTabID }) else { return }
        update(&tabs[index])
    }
}
#endif
