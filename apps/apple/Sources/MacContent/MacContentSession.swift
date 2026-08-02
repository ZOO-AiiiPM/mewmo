import Foundation
import Observation

@MainActor
@Observable
final class MacContentSession {
    enum State: Equatable {
        case loading
        case signedOut
        case ready
        case unavailable
    }

    private static let defaultBaseURL = URL(string: "https://mewmo.vercel.app")!

    private let baseURL: URL
    private let authController: AuthSessionController
    private var lifecycleCoordinator: SyncLifecycleCoordinator?
    private var started = false

    private(set) var state: State = .loading
    private(set) var content: MacContentStore?
    let imagePipeline: MewmoImagePipeline?

    init(baseURL: URL? = nil) {
        let baseURL = baseURL ?? Self.defaultBaseURL
        self.baseURL = baseURL
        authController = AuthSessionController(baseURL: baseURL)
        imagePipeline = try? MewmoImagePipeline()
    }

    func start() async {
        guard !started else { return }
        started = true

        do {
            guard let session = try await authController.restore() else {
                state = .signedOut
                return
            }
            let store = try LocalStore(modelContainer: LocalDataContainer.account(storeURL: try storeURL(for: session.user.id)))
            let client = AuthenticatedHTTPClient(controller: authController, transport: URLSessionNativeAuthTransport())
            let engine = SyncEngine(baseURL: baseURL, userId: session.user.id, localStore: store, httpClient: client)
            lifecycleCoordinator = SyncLifecycleCoordinator(engine: engine)

            let content = MacContentStore(localStore: store, userId: session.user.id, syncEngine: engine)
            self.content = content
            state = .ready
            await content.load()
            await content.synchronize(trigger: .launch)
        } catch {
            state = .unavailable
        }
    }

    func didBecomeActive() {
        guard let content else { return }
        Task { await content.synchronize(trigger: .foreground) }
    }

    private func storeURL(for accountID: String) throws -> URL {
        let root = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        ).appendingPathComponent("Mewmo", isDirectory: true)
        return try LocalDataContainer.diskStoreURL(directory: root, accountID: accountID)
    }
}
