import Foundation
import Nuke

/// mewmo 共享图片管线（ZOO-92）。
///
/// 职责：把 Nuke 13 core 组合成项目级 pipeline——显式配置内存/磁盘上限、LRU `DataCache`、
/// `URLCache` HTTP validator 与可注入的缓存目录；对外只暴露「按原始 URL 加载图片」的
/// async/await 接口、缓存查询与清空/trim 生命周期。
///
/// 刻意不做的事（见 PRD Out of Scope）：
/// - 不实现 downloader / request coalescing / LRU / decoder——全部复用 Nuke 内建能力；
/// - 不把图片二进制写回 SwiftData / 不改写来源 URL / 不按页面复制图片文件；
/// - 不承载业务 SwiftUI 展示、上传、批量预取（ZOO-96/97）。
///
/// concurrency：`ImagePipeline` 是 `Sendable`，其加载接口为 `nonisolated async/await`；
/// 本类型只持有一个不可变的 pipeline 引用，可安全跨线程共享（composition root 持有）。
public final class MewmoImagePipeline: Sendable {
    /// 底层 Nuke pipeline。测试用 mock transport 通过注入的 loader 替换。
    public let pipeline: ImagePipeline
    /// 本次组成的配置（供生命周期与容量查询）。
    public let config: ImagePipelineConfig
    /// production 使用的缓存根目录（caches directory）。测试通过 `temporaryDirectory` 注入。
    public let cacheDirectory: URL
    /// 系统 HTTP 缓存（`URLCache`）：保留 ETag/Last-Modified validator 并处理条件请求，
    /// 同时被 `clearDisk()` / `removeAllCaches()` 显式清理。`let` 持引用，供生命周期 API 访问。
    public let urlCache: URLCache

    /// 磁盘数据缓存（仅 `enableDataCache` 时非空）。
    public var dataCache: DataCache? { pipeline.configuration.dataCache as? DataCache }
    /// 内存图片缓存（composition 显式构造）。
    public var memoryCache: ImageCache? { pipeline.configuration.imageCache as? ImageCache }

    // MARK: - Lifecycle

    /// 创建共享图片管线，缓存落在系统 caches directory 下的独立子目录。
    public convenience init(config: ImagePipelineConfig = ImagePipelineConfig(), dataLoader: (any DataLoading)? = nil) throws {
        let root = try cacheRoot()
        try self.init(
            config: config,
            cacheDirectory: root,
            dataLoader: dataLoader
        )
    }

    /// 创建图片管线，缓存目录显式注入（测试传临时目录），并可选替换 data loader
    /// （测试传 mock `DataLoading` 以不访问公网）。
    public init(
        config: ImagePipelineConfig,
        cacheDirectory: URL,
        dataLoader: (any DataLoading)?
    ) throws {
        self.config = config
        self.cacheDirectory = cacheDirectory

        // LRU DataCache 保存可复用原始图片数据（可注入目录）。enableDataCache=false 时留空，
        // 让 Nuke 纯走 URLCache 语义（强制条件请求 revalidation，供 validator 场景使用）。
        // 创建失败必须显式抛出 setup error，禁止 `try?` 静默退化为无磁盘缓存（ZOO-117）。
        let dataCachePath = cacheDirectory.appendingPathComponent(config.dataCacheDirectoryName, isDirectory: true)
        var dataCache: DataCache?
        if config.enableDataCache {
            do {
                dataCache = try DataCache(path: dataCachePath)
            } catch {
                throw ImageCacheSetupError.dataCacheInitializationFailed(
                    path: dataCachePath.path,
                    message: String(describing: error)
                )
            }
            dataCache?.sizeLimit = config.diskSizeLimit
        }

        // URL cache：保留 validator、处理 304；同时被 clearDisk/removeAllCaches 显式清理。
        let urlCache = URLCache(
            memoryCapacity: config.urlCacheMemoryCapacity,
            diskCapacity: config.urlCacheDiskCapacity,
            diskPath: cacheDirectory.appendingPathComponent(config.urlCacheDirectoryName, isDirectory: true).path
        )
        self.urlCache = urlCache

        // 生产用 DataLoader + URLCache 组合：URLCache 保留 ETag/Last-Modified validator 并处理 304。
        // 测试可注入自定义 DataLoading（mock transport），此时不构造 URLSession，避免触碰公网。
        let effectiveLoader: any DataLoading = {
            if let loader = dataLoader { return loader }
            let conf = URLSessionConfiguration.default
            conf.urlCache = urlCache
            return DataLoader(configuration: conf)
        }()

        var pipelineConfig = ImagePipeline.Configuration(dataLoader: effectiveLoader)
        pipelineConfig.imageCache = ImageCache(costLimit: config.memoryCostLimit, countLimit: Int.max)
        pipelineConfig.dataCache = dataCache
        pipelineConfig.dataCachePolicy = .storeOriginalData
        // 明确开启 task coalescing（共享同 URL 的底层下载）与 cancellation 语义（默认即开，这里显式声明）。
        pipelineConfig.isTaskCoalescingEnabled = true

        self.pipeline = ImagePipeline(configuration: pipelineConfig)
    }

    // MARK: - Loading

    /// 加载结果：图片 + 来源缓存层（memory/disk/network）。
    public struct LoadResult: Sendable {
        public let image: PlatformImage
        public let cacheType: ImageResponse.CacheType?
    }

    /// 按原始来源 URL 异步加载图片（在线优先）。
    ///
    /// 失败策略：非取消错误下先回退读磁盘缓存；磁盘有内容则返回（离线可用）；否则把底层错误
    /// 投影为可分类的 `ImageLoadError` 抛给调用方。取消错误直接抛出 `.cancelled`。
    public func load(from url: URL) async throws -> LoadResult {
        let request = ImageRequest(url: url)
        do {
            let response = try await pipeline.imageTask(with: request).response
            return LoadResult(image: response.image, cacheType: response.cacheType)
        } catch is CancellationError {
            throw ImageLoadError.cancelled
        } catch let error as ImagePipeline.Error {
            if case .cancelled = error {
                throw ImageLoadError.cancelled
            }
            // 网络/加载失败时回退读磁盘缓存，保证已有内容的离线可用。
            if let disk = cachedLoadResult(from: url) {
                return disk
            }
            throw ImageLoadError.project(error)
        } catch {
            throw ImageLoadError.project(ImagePipeline.Error.dataLoadingFailed(error: error))
        }
    }

    /// 只读磁盘缓存（不触发网络）。离线降级与测试的“重建 pipeline 后磁盘命中”都走这里。
    public func cachedLoadResult(from url: URL) -> LoadResult? {
        let request = ImageRequest(url: url)
        guard let container = pipeline.cache.cachedImage(for: request, caches: [.disk]) else {
            return nil
        }
        return LoadResult(image: container.image, cacheType: .disk)
    }

    // MARK: - Lifecycle: clear / trim

    /// 清空内存图片缓存。
    public func clearMemory() {
        memoryCache?.removeAll()
    }

    /// 清空磁盘侧缓存：Nuke `DataCache`（LRU 原始数据）与系统 `URLCache`（HTTP validator/304 复用）。
    public func clearDisk() {
        dataCache?.removeAll()
        urlCache.removeAllCachedResponses()
    }

    /// 清空内存 + 所有磁盘侧缓存（`DataCache` + `URLCache`）。
    public func removeAllCaches() {
        pipeline.cache.removeAll(caches: [.memory, .disk])
        urlCache.removeAllCachedResponses()
    }

    /// 显式执行 trim：内存 cache 修剪到配置 cost limit，磁盘 DataCache 按 sizeLimit 执行 LRU sweep。
    ///
    /// 这是“缓存清理是显式生命周期动作”，不与普通加载失败耦合（PRD Requirement 7）。
    public func trim() {
        memoryCache?.trim(toCost: config.memoryCostLimit)
        dataCache?.sweep()
    }
}

// MARK: - Helpers

/// 定位 production 缓存根目录（`FileManager.urls(for: .cachesDirectory, in: .userDomainMask)`）。
func cacheRoot() throws -> URL {
    guard let root = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first else {
        throw ImageCacheSetupError.noCachesDirectory
    }
    return root
}

/// 图片缓存初始化错误（ZOO-117）：DataCache 初始化失败必须显式抛出并分类，禁止静默降级。
public enum ImageCacheSetupError: Error, Sendable, Equatable {
    /// 找不到系统 caches directory。
    case noCachesDirectory
    /// `DataCache`（磁盘 LRU 缓存）创建/初始化失败。
    /// `path` 便于定位目录；`message` 保留底层错误描述（不含非 Sendable 的错误对象）。
    case dataCacheInitializationFailed(path: String, message: String)

    public var errorDescription: String? {
        switch self {
        case .noCachesDirectory:
            return "无法定位系统 caches directory"
        case .dataCacheInitializationFailed(let path, let message):
            return "磁盘缓存初始化失败（path: \(path)）：\(message)"
        }
    }
}
