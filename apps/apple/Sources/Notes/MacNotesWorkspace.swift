#if os(macOS)
import AppKit
import SwiftUI

@MainActor
final class MacNotesViewModel: ObservableObject {
    enum SyncState: Equatable {
        case loading
        case saved
        case offline
        case saving
        case error
        case conflict

        var label: String {
            switch self {
            case .loading: "正在读取…"
            case .saved: "已保存并同步"
            case .offline: "已保存到此 Mac"
            case .saving: "正在同步…"
            case .error: "同步失败，稍后重试"
            case .conflict: "发现冲突，内容已保留"
            }
        }
    }

    struct Conflict: Codable, Identifiable {
        let id: String
        let title: String
        let content: String
        let pinned: Bool
    }

    private struct PendingNoteReference: Decodable {
        let entity: String
        let op: String
        let id: String
    }

    private struct LocalChange {
        let note: NoteSnapshot
        let deleted: Bool
    }

    @Published private(set) var notes: [NoteSnapshot] = []
    @Published var selectedID: String?
    @Published var query = ""
    @Published var pinnedOnly = false
    @Published private(set) var syncState: SyncState = .loading
    @Published private(set) var loadError: String?
    @Published var conflict: Conflict?

    private var userID: String
    private var store: LocalStore?
    private var syncEngine: SyncEngine?

    init() {
        userID = UserDefaults.standard.string(forKey: "mewmo.last-note-user") ?? "local"
        configureStore(for: userID)
    }

    var visibleNotes: [NoteSnapshot] {
        notes.filter { note in
            (!pinnedOnly || note.pinned) &&
                (query.isEmpty || note.title.localizedCaseInsensitiveContains(query) || note.content.localizedCaseInsensitiveContains(query))
        }
    }

    var selectedNote: NoteSnapshot? { notes.first { $0.id == selectedID } }

    func start() async {
        await reload()
        await restoreAuthenticatedSync()
    }

    func reload() async {
        guard let store else {
            loadError = "无法打开本地笔记库。"
            syncState = .error
            return
        }
        do {
            notes = try await store.listNotes(userId: userID)
            if selectedID == nil || !notes.contains(where: { $0.id == selectedID }) {
                selectedID = notes.first?.id
            }
            if syncState == .loading { syncState = syncEngine == nil ? .offline : .saved }
            loadError = nil
        } catch {
            loadError = "无法读取笔记。"
            syncState = .error
        }
    }

    func create() async {
        guard let store else { return }
        do {
            let note = try await MacNoteMutations.create(store: store, userId: userID)
            notes.insert(note, at: 0)
            selectedID = note.id
            await synchronize()
        } catch {
            loadError = "无法新建笔记。"
            syncState = .error
        }
    }

    func save(noteID: String, title: String, content: String, pinned: Bool) async {
        guard let store, let note = notes.first(where: { $0.id == noteID }) else { return }
        do {
            let changed = try await MacNoteMutations.update(
                store: store, note: note, title: title, content: content, pinned: pinned
            )
            replace(changed)
            await synchronize()
        } catch {
            loadError = "无法保存笔记。"
            syncState = .error
        }
    }

    func deleteSelected() async {
        guard let store, let note = selectedNote else { return }
        do {
            try await MacNoteMutations.delete(store: store, note: note)
            notes.removeAll { $0.id == note.id }
            selectedID = notes.first?.id
            await synchronize()
        } catch {
            loadError = "无法删除笔记。"
            syncState = .error
        }
    }

    func keepLocalConflict() async {
        guard let conflict, let store else { return }
        do {
            let copy = try await MacNoteMutations.create(
                store: store,
                userId: userID,
                title: "\(conflict.title)（冲突副本）"
            )
            let changed = try await MacNoteMutations.update(
                store: store, note: copy, title: copy.title, content: conflict.content, pinned: conflict.pinned
            )
            notes.insert(changed, at: 0)
            selectedID = changed.id
            clearConflict()
            await synchronize()
        } catch {
            syncState = .error
        }
    }

    func useRemoteConflict() {
        clearConflict()
        syncState = syncEngine == nil ? .offline : .saved
    }

    private func replace(_ note: NoteSnapshot) {
        if let index = notes.firstIndex(where: { $0.id == note.id }) {
            notes[index] = note
        } else {
            notes.insert(note, at: 0)
        }
        notes.sort {
            if $0.pinned != $1.pinned { return $0.pinned }
            if $0.updatedAt != $1.updatedAt { return $0.updatedAt > $1.updatedAt }
            return $0.id < $1.id
        }
    }

    private func synchronize() async {
        guard let syncEngine else { syncState = .offline; return }
        guard let store else { return }
        let changes = await pendingNoteChanges(store: store)
        syncState = .saving
        await syncEngine.synchronize(trigger: .manual)
        let diagnostics = await syncEngine.diagnostics()
        await reload()
        if diagnostics.phase == .succeeded {
            for (id, local) in changes {
                guard let remote = try? await store.note(id: id, userId: userID, includeDeleted: true) else { continue }
                let diverged = local.deleted
                    ? remote.deletedAt == nil
                    : remote.version > local.note.version && (remote.title != local.note.title || remote.content != local.note.content || remote.pinned != local.note.pinned)
                if diverged {
                    let conflict = Conflict(id: id, title: local.note.title, content: local.note.content, pinned: local.note.pinned)
                    self.conflict = conflict
                    saveConflict(conflict)
                    syncState = .conflict
                    return
                }
            }
            syncState = .saved
        } else {
            _ = store
            syncState = .error
        }
    }

    private func pendingNoteChanges(store: LocalStore) async -> [String: LocalChange] {
        guard let pending = try? await store.listPendingMutations(userId: userID) else { return [:] }
        var changes: [String: LocalChange] = [:]
        for mutation in pending where mutation.entityKind == "note" {
            guard let reference = try? JSONDecoder().decode(PendingNoteReference.self, from: Data(mutation.payloadJSON.utf8)),
                  reference.entity == "note",
                  let note = try? await store.note(id: reference.id, userId: userID, includeDeleted: true) else { continue }
            changes[reference.id] = LocalChange(note: note, deleted: reference.op == "delete")
        }
        return changes
    }

    private func configureStore(for accountID: String) {
        do {
            let appSupport = try FileManager.default.url(
                for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true
            ).appendingPathComponent("mewmo", isDirectory: true)
            let url = try LocalDataContainer.diskStoreURL(directory: appSupport, accountID: accountID)
            store = try LocalStore(modelContainer: LocalDataContainer.account(storeURL: url))
            UserDefaults.standard.set(accountID, forKey: "mewmo.last-note-user")
            conflict = savedConflict()
        } catch {
            store = nil
        }
    }

    private var conflictKey: String { "mewmo.note-conflict.\(userID)" }

    private func saveConflict(_ conflict: Conflict) {
        UserDefaults.standard.set(try? JSONEncoder().encode(conflict), forKey: conflictKey)
    }

    private func savedConflict() -> Conflict? {
        guard let data = UserDefaults.standard.data(forKey: conflictKey) else { return nil }
        return try? JSONDecoder().decode(Conflict.self, from: data)
    }

    private func clearConflict() {
        conflict = nil
        UserDefaults.standard.removeObject(forKey: conflictKey)
    }

    private func restoreAuthenticatedSync() async {
        guard let baseURL = URL(string: "https://mewmo.vercel.app") else { return }
        let sessionController = AuthSessionController(baseURL: baseURL)
        guard let session = try? await sessionController.restore() else { return }
        if session.user.id != userID {
            userID = session.user.id
            configureStore(for: userID)
            await reload()
        }
        guard let store else { return }
        syncEngine = SyncEngine(
            baseURL: baseURL,
            userId: userID,
            localStore: store,
            httpClient: AuthenticatedHTTPClient(controller: sessionController, transport: URLSessionNativeAuthTransport())
        )
        await synchronize()
    }
}

struct MacNotesWorkspace: View {
    @StateObject private var model = MacNotesViewModel()
    @FocusState private var searchFocused: Bool
    @State private var title = ""
    @State private var content = ""
    @State private var pinned = false
    @State private var deleteConfirmation = false
    @State private var loadingSelection = false
    @State private var saveTask: Task<Void, Never>?

    var body: some View {
        NavigationSplitView {
            list
        } detail: {
            editor
        }
        .navigationSplitViewStyle(.balanced)
        .task { await model.start() }
        .onChange(of: model.selectedID) { _, _ in loadSelection() }
        .onDisappear { saveTask?.cancel() }
        .alert("删除这条笔记？", isPresented: $deleteConfirmation) {
            Button("删除", role: .destructive) { Task { await model.deleteSelected() } }
            Button("取消", role: .cancel) {}
        } message: {
            Text("笔记会从本机列表移除，并在下次同步时软删除。")
        }
        .alert("发现同步冲突", isPresented: Binding(get: { model.conflict != nil }, set: { if !$0 { model.useRemoteConflict() } })) {
            Button("保留本地副本") { Task { await model.keepLocalConflict() } }
            Button("使用远端版本", role: .cancel) { model.useRemoteConflict() }
        } message: {
            Text("远端内容没有静默覆盖你的编辑。你可以保留一份本地副本。")
        }
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                Button { Task { await model.create() } } label: {
                    Label("新建笔记", systemImage: "square.and.pencil")
                }
                .keyboardShortcut("n", modifiers: .command)

                Button { searchFocused = true } label: {
                    Label("搜索", systemImage: "magnifyingglass")
                }
                .keyboardShortcut("f", modifiers: .command)

                Button { saveSelection() } label: {
                    Label("保存", systemImage: "square.and.arrow.down")
                }
                .keyboardShortcut("s", modifiers: .command)
                .disabled(model.selectedNote == nil)

                Button(role: .destructive) { deleteConfirmation = true } label: {
                    Label("删除", systemImage: "trash")
                }
                .keyboardShortcut(.delete, modifiers: [])
                .disabled(model.selectedNote == nil)
            }
        }
    }

    private var list: some View {
        VStack(spacing: 0) {
            HStack {
                TextField("搜索笔记", text: $model.query)
                    .textFieldStyle(.roundedBorder)
                    .focused($searchFocused)
                Button { model.pinnedOnly.toggle() } label: {
                    Image(systemName: model.pinnedOnly ? "pin.fill" : "pin")
                }
                .help("仅看置顶")
            }
            .padding(12)

            Picker("笔记筛选", selection: $model.pinnedOnly) {
                Text("全部").tag(false)
                Text("置顶").tag(true)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 12)
            .padding(.bottom, 8)

            if model.syncState == .loading {
                List(0..<6, id: \.self) { _ in Text("正在读取笔记").redacted(reason: .placeholder) }
            } else if let loadError = model.loadError, model.notes.isEmpty {
                ContentUnavailableView("无法加载笔记", systemImage: "exclamationmark.triangle", description: Text(loadError))
            } else if model.visibleNotes.isEmpty {
                ContentUnavailableView("没有笔记", systemImage: "note.text", description: Text("新建一条笔记，或调整搜索和筛选。"))
            } else {
                List(model.visibleNotes, id: \.id, selection: $model.selectedID) { note in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(note.title).font(.headline).lineLimit(1)
                            if note.pinned { Image(systemName: "pin.fill").font(.caption) }
                        }
                        Text(note.content).font(.callout).foregroundStyle(.secondary).lineLimit(2)
                        Text(note.updatedAt, style: .relative).font(.caption).foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                    .tag(note.id)
                    .accessibilityElement(children: .combine)
                }
            }
        }
        .navigationTitle("笔记")
        .navigationSplitViewColumnWidth(min: 260, ideal: 312, max: 360)
    }

    @ViewBuilder
    private var editor: some View {
        if model.selectedNote != nil {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text(model.syncState.label).font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    Toggle("置顶", isOn: $pinned)
                        .toggleStyle(.button)
                        .onChange(of: pinned) { _, _ in scheduleSave() }
                }
                TextField("标题", text: $title)
                    .font(.title2.weight(.semibold))
                    .onChange(of: title) { _, _ in scheduleSave() }
                Divider()
                TextEditor(text: $content)
                    .font(.system(size: 15.5))
                    .accessibilityLabel("笔记正文 Markdown")
                    .onChange(of: content) { _, _ in scheduleSave() }
                MacNoteImageStrip(markdown: content)
            }
            .padding(20)
            .onAppear(perform: loadSelection)
        } else {
            ContentUnavailableView("选择一条笔记", systemImage: "note.text", description: Text("从左侧列表选择，或新建一条笔记。"))
        }
    }

    private func loadSelection() {
        loadingSelection = true
        title = model.selectedNote?.title ?? ""
        content = model.selectedNote?.content ?? ""
        pinned = model.selectedNote?.pinned ?? false
        DispatchQueue.main.async { loadingSelection = false }
    }

    private func scheduleSave() {
        guard !loadingSelection, let noteID = model.selectedID else { return }
        let title = title
        let content = content
        let pinned = pinned
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await model.save(noteID: noteID, title: title, content: content, pinned: pinned)
        }
    }

    private func saveSelection() {
        saveTask?.cancel()
        guard let noteID = model.selectedID else { return }
        Task { await model.save(noteID: noteID, title: title, content: content, pinned: pinned) }
    }
}

private struct MacNoteImageStrip: View {
    private static let pipeline = try? MewmoImagePipeline()
    let markdown: String

    var body: some View {
        let urls = markdownImageURLs(markdown)
        if !urls.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(urls, id: \.absoluteString) { url in
                        MacNoteImage(url: url, pipeline: Self.pipeline)
                    }
                }
            }
            .frame(height: 76)
            .accessibilityLabel("笔记图片预览")
        }
    }
}

private struct MacNoteImage: View {
    let url: URL
    let pipeline: MewmoImagePipeline?
    @State private var image: NSImage?

    var body: some View {
        Group {
            if let image {
                Image(nsImage: image).resizable().scaledToFill()
            } else {
                RoundedRectangle(cornerRadius: 6).fill(.quaternary)
            }
        }
        .frame(width: 96, height: 64)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        .task {
            guard let pipeline, let result = try? await pipeline.load(from: url) else { return }
            image = result.image
        }
    }
}

private func markdownImageURLs(_ markdown: String) -> [URL] {
    let pattern = #"!\[[^\]]*\]\((https?://[^\s)]+)"#
    guard let expression = try? NSRegularExpression(pattern: pattern) else { return [] }
    let range = NSRange(markdown.startIndex..., in: markdown)
    return expression.matches(in: markdown, range: range).compactMap { match in
        guard let range = Range(match.range(at: 1), in: markdown) else { return nil }
        return URL(string: String(markdown[range]))
    }
}
#endif
