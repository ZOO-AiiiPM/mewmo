#if os(macOS)
import AppKit
import SwiftUI

struct MacClipsListColumn: View {
    @Bindable var content: MacContentStore
    let colorScheme: ColorScheme
    let imagePipeline: MewmoImagePipeline?
    let focusRequest: Int
    @FocusState private var searchIsFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            TextField("Search clips", text: $content.clipSearch)
                .textFieldStyle(.roundedBorder)
                .focused($searchIsFocused)
                .padding(12)
                .onChange(of: content.clipSearch) { _, query in
                    Task { await content.updateClipSearch(query) }
                }
                .onChange(of: focusRequest) { _, _ in searchIsFocused = true }

            MacSyncStatusView(content: content, colorScheme: colorScheme)
            Divider().overlay(MacShellPalette.line(for: colorScheme))
            clipsBody
        }
        .navigationTitle("Clips")
        .background(MacShellPalette.surface(for: colorScheme))
        .navigationSplitViewColumnWidth(min: 260, ideal: 312, max: 360)
    }

    @ViewBuilder
    private var clipsBody: some View {
        if content.isLoading && content.clips.isEmpty {
            ProgressView("Loading local clips")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if content.loadFailed && content.clips.isEmpty {
            ContentUnavailableView("Clips unavailable", systemImage: "exclamationmark.triangle", description: Text("Open the app again to retry local storage."))
        } else if content.filteredClips.isEmpty {
            ContentUnavailableView("No clips", systemImage: "paperclip", description: Text(content.clipSearch.isEmpty ? "Saved clips appear here." : "No local clip matches this search."))
        } else {
            List(selection: $content.selectedClipID) {
                ForEach(content.filteredClips, id: \.id) { clip in
                    HStack(alignment: .top, spacing: 10) {
                        MewmoRemoteImage(url: URL(string: clip.coverImageURL ?? ""), pipeline: imagePipeline)
                            .frame(width: 58, height: 44)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(clip.title)
                                .font(.headline)
                                .lineLimit(2)
                            Text(clip.excerpt ?? clip.summary ?? clip.url)
                                .font(.callout)
                                .foregroundStyle(MacShellPalette.secondaryText(for: colorScheme))
                                .lineLimit(2)
                            Text(clip.sourceName ?? clip.url)
                                .font(.caption)
                                .foregroundStyle(MacShellPalette.secondaryText(for: colorScheme))
                                .lineLimit(1)
                        }
                    }
                    .padding(.vertical, 4)
                    .tag(clip.id)
                    .accessibilityElement(children: .combine)
                }

                if content.hasMoreClips {
                    Button("Load more clips") { Task { await content.loadMoreClips() } }
                        .frame(maxWidth: .infinity)
                }
            }
            .scrollContentBackground(.hidden)
        }
    }
}

struct MacFeedsListColumn: View {
    @Bindable var content: MacContentStore
    let colorScheme: ColorScheme
    let imagePipeline: MewmoImagePipeline?
    let focusRequest: Int
    @FocusState private var searchIsFocused: Bool

    var body: some View {
        VStack(spacing: 0) {
            TextField("Search feed entries", text: $content.entrySearch)
                .textFieldStyle(.roundedBorder)
                .focused($searchIsFocused)
                .padding(12)
                .onChange(of: content.entrySearch) { _, query in
                    Task { await content.updateEntrySearch(query) }
                }
                .onChange(of: focusRequest) { _, _ in searchIsFocused = true }

            MacSyncStatusView(content: content, colorScheme: colorScheme)
            Divider().overlay(MacShellPalette.line(for: colorScheme))
            entriesBody
        }
        .navigationTitle(content.selectedFeed?.title ?? "Feeds")
        .background(MacShellPalette.surface(for: colorScheme))
        .navigationSplitViewColumnWidth(min: 260, ideal: 312, max: 360)
    }

    @ViewBuilder
    private var entriesBody: some View {
        if content.isLoading && content.entries.isEmpty {
            ProgressView("Loading local feed entries")
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if content.loadFailed && content.entries.isEmpty {
            ContentUnavailableView("Feed entries unavailable", systemImage: "exclamationmark.triangle", description: Text("Open the app again to retry local storage."))
        } else if content.filteredEntries.isEmpty {
            ContentUnavailableView("No feed entries", systemImage: "dot.radiowaves.left.and.right", description: Text(content.entrySearch.isEmpty ? "New entries from this subscription appear here." : "No local entry matches this search."))
        } else {
            List(selection: $content.selectedEntryID) {
                ForEach(content.filteredEntries, id: \.id) { entry in
                    HStack(alignment: .top, spacing: 10) {
                        MewmoRemoteImage(url: URL(string: entry.coverImageURL ?? ""), pipeline: imagePipeline)
                            .frame(width: 58, height: 44)
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 5) {
                                if entry.readAt == nil {
                                    Image(systemName: "circle.fill")
                                        .font(.system(size: 7))
                                        .accessibilityLabel("Unread")
                                }
                                Text(entry.title)
                                    .font(.headline)
                                    .lineLimit(2)
                            }
                            Text(entry.excerpt ?? entry.summary ?? entry.url)
                                .font(.callout)
                                .foregroundStyle(MacShellPalette.secondaryText(for: colorScheme))
                                .lineLimit(2)
                            Text(entry.sourceName ?? entry.url)
                                .font(.caption)
                                .foregroundStyle(MacShellPalette.secondaryText(for: colorScheme))
                                .lineLimit(1)
                        }
                    }
                    .padding(.vertical, 4)
                    .tag(entry.id)
                    .accessibilityElement(children: .combine)
                }

                if content.hasMoreEntries {
                    Button("Load more entries") { Task { await content.loadMoreEntries() } }
                        .frame(maxWidth: .infinity)
                }
            }
            .scrollContentBackground(.hidden)
        }
    }
}

struct MacContentDetailColumn: View {
    let section: MacShellSection?
    let content: MacContentStore
    let colorScheme: ColorScheme
    let imagePipeline: MewmoImagePipeline?

    var body: some View {
        switch section {
        case .clips:
            clipDetail
        case .feeds:
            feedDetail
        default:
            ContentUnavailableView("Choose a workspace", systemImage: "rectangle.3.group", description: Text("Clips and feeds are available in this Mac preview."))
        }
    }

    @ViewBuilder
    private var clipDetail: some View {
        if let clip = content.selectedClip {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    MewmoRemoteImage(url: URL(string: clip.coverImageURL ?? ""), pipeline: imagePipeline)
                        .frame(maxWidth: .infinity, minHeight: 180, maxHeight: 260)
                    Text(clip.title).font(.title2.weight(.semibold))
                    Text(clip.sourceName ?? clip.url)
                        .font(.callout)
                        .foregroundStyle(MacShellPalette.secondaryText(for: colorScheme))
                    if clip.fetchStatus == "failed", let error = clip.fetchError {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                    Divider().overlay(MacShellPalette.line(for: colorScheme))
                    Text(MacReaderText.plain(clip.content, fallback: clip.summary ?? clip.excerpt ?? "No saved content."))
                        .textSelection(.enabled)
                    if let url = URL(string: clip.url) {
                        Link("Open original", destination: url)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(28)
            }
        } else {
            ContentUnavailableView("Select a clip", systemImage: "paperclip", description: Text("Choose a saved clip from the list."))
        }
    }

    @ViewBuilder
    private var feedDetail: some View {
        if let entry = content.selectedEntry {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    MewmoRemoteImage(url: URL(string: entry.coverImageURL ?? ""), pipeline: imagePipeline)
                        .frame(maxWidth: .infinity, minHeight: 180, maxHeight: 260)
                    Text(entry.title).font(.title2.weight(.semibold))
                    Text(entry.sourceName ?? content.selectedFeed?.title ?? entry.url)
                        .font(.callout)
                        .foregroundStyle(MacShellPalette.secondaryText(for: colorScheme))
                    Divider().overlay(MacShellPalette.line(for: colorScheme))
                    Text(MacReaderText.plain(entry.content, fallback: entry.summary ?? entry.excerpt ?? "No saved content."))
                        .textSelection(.enabled)
                    if let url = URL(string: entry.url) {
                        Link("Open original", destination: url)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(28)
            }
        } else if let feed = content.selectedFeed {
            ContentUnavailableView(feed.title, systemImage: "dot.radiowaves.left.and.right", description: Text(feed.feedDescription ?? "Choose an entry from this subscription."))
        } else {
            ContentUnavailableView("Select a subscription", systemImage: "dot.radiowaves.left.and.right", description: Text("Choose a feed source in the sidebar."))
        }
    }
}

struct MacSyncStatusView: View {
    let content: MacContentStore
    let colorScheme: ColorScheme

    var body: some View {
        HStack(spacing: 6) {
            if content.isSynchronizing {
                ProgressView().controlSize(.small)
                Text("Syncing")
            } else if content.syncFailure != nil {
                Label("Sync needs attention", systemImage: "exclamationmark.triangle")
            } else if content.isStale {
                Label("Showing local copy", systemImage: "wifi.slash")
            } else if let date = content.lastSyncedAt {
                Label {
                    Text(date, style: .relative)
                } icon: {
                    Image(systemName: "checkmark.icloud")
                }
            } else {
                Label("Local copy", systemImage: "internaldrive")
            }
            Spacer()
            Button {
                Task { await content.synchronize() }
            } label: {
                Image(systemName: "arrow.clockwise")
            }
            .buttonStyle(.borderless)
            .help("Sync now")
            .accessibilityLabel("Sync now")
        }
        .font(.caption)
        .foregroundStyle(MacShellPalette.secondaryText(for: colorScheme))
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
    }
}

struct MewmoRemoteImage: View {
    let url: URL?
    let pipeline: MewmoImagePipeline?
    @State private var image: NSImage?

    var body: some View {
        Group {
            if let image {
                Image(nsImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else {
                RoundedRectangle(cornerRadius: 4)
                    .fill(.quaternary)
                    .overlay(Image(systemName: "photo").foregroundStyle(.secondary))
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 4))
        .task(id: url) {
            guard let url, let pipeline else {
                image = nil
                return
            }
            image = try? await pipeline.load(from: url).image
        }
        .accessibilityHidden(true)
    }
}

private enum MacReaderText {
    static func plain(_ content: String, fallback: String) -> String {
        guard !content.isEmpty, let data = content.data(using: .utf8) else { return fallback }
        return (try? NSAttributedString(
            data: data,
            options: [.documentType: NSAttributedString.DocumentType.html, .characterEncoding: String.Encoding.utf8.rawValue],
            documentAttributes: nil
        ).string) ?? fallback
    }
}
#endif
