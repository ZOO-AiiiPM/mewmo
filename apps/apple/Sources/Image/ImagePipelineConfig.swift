import Foundation
import Nuke

/// 图片管线的集中容量配置（ZOO-92）。
///
/// 所有 magic numbers 收敛到一类，避免散落在业务层。默认值对应“笔记七牛图 + 剪藏/Feed
/// 原站图”的典型规模：内存按设备物理内存按比例折算，磁盘/HTTP 缓存给出固定上限。
public struct ImagePipelineConfig: Sendable, Equatable {
    /// 内存图片缓存（`ImageCache`）的 cost limit（字节，LRU）。默认取 Nuke 推荐的 15% 物理内存，上限 768 MB。
    public var memoryCostLimit: Int
    /// 磁盘图片数据缓存（`DataCache`）的 size limit（字节，LRU），配合 `trimRatio` 生效。
    public var diskSizeLimit: Int
    /// URLCache 的内存容量（字节）。Nuke 用它在内存中保存带 HTTP validator 的响应元数据。
    public var urlCacheMemoryCapacity: Int
    /// URLCache 的磁盘容量（字节）。负责 ETag/Last-Modified 条件请求与 304 复用的持久化。
    public var urlCacheDiskCapacity: Int
    /// 磁盘数据缓存目录名（production 位于系统 caches directory 下）。
    public var dataCacheDirectoryName: String
    /// URLCache 磁盘目录名（production 位于系统 caches directory 下）。
    public var urlCacheDirectoryName: String
    /// 是否启用 Nuke `DataCache`（LRU 原始数据磁盘缓存）。`true` 时与 `URLCache` 共存：
    /// DataCache 承担可复用原始数据 + LRU 上限，URLCache 保留 HTTP validator 并处理条件请求；
    /// DataCache 命中时不触发网络。`false` 时纯走 `URLCache`（Nuke `withURLCache` 语义），
    /// 用于需要强制走条件请求 revalidation 的场景（如 validator 测试）。
    public var enableDataCache: Bool

    public init(
        memoryCostLimit: Int = Self.defaultMemoryCostLimit,
        diskSizeLimit: Int = 150 * 1024 * 1024,
        urlCacheMemoryCapacity: Int = 0,
        urlCacheDiskCapacity: Int = 150 * 1024 * 1024,
        dataCacheDirectoryName: String = "mewmo-image-data-cache",
        urlCacheDirectoryName: String = "mewmo-image-url-cache",
        enableDataCache: Bool = true
    ) {
        self.memoryCostLimit = memoryCostLimit
        self.diskSizeLimit = diskSizeLimit
        self.urlCacheMemoryCapacity = urlCacheMemoryCapacity
        self.urlCacheDiskCapacity = urlCacheDiskCapacity
        self.dataCacheDirectoryName = dataCacheDirectoryName
        self.urlCacheDirectoryName = urlCacheDirectoryName
        self.enableDataCache = enableDataCache
    }

    /// 默认内存 cost limit：物理内存的 15%，上限 768 MB（与 Nuke `ImageCache.defaultCostLimit` 一致）。
    public static var defaultMemoryCostLimit: Int {
        ImageCache.defaultCostLimit
    }
}

// MARK: - Image load errors

/// 面向后续业务层的图片加载错误投影（ZOO-92）。
///
/// 把 Nuke 的底层错误收敛成业务层可稳定降级的四类：取消、离线/缓存未命中、无效响应（非 2xx）、
/// 解码失败。`other` 兜底未知错误，避免让调用方处理 Nuke 具体错误。`Equatable` 供测试断言。
public enum ImageLoadError: Error, Sendable, Equatable {
    /// 调用方请求被取消（或共享请求的最后订阅者已取消）。
    case cancelled
    /// 离线或磁盘未命中：没有任何可用的缓存内容，且加载失败。
    case offlineOrMiss
    /// 数据加载返回非 2xx（`URLCache`/`DataLoader` 校验失败）。
    case invalidResponse(statusCode: Int)
    /// 数据无法解码为图片。
    case decodeFailed
    /// 未知底层错误（保留 description 便于调试）。
    case other(String)

    /// 从 Nuke 错误投影到业务层错误。仅分类，不携带可变状态。
    static func project(_ error: ImagePipeline.Error) -> ImageLoadError {
        switch error {
        case .cancelled, .pipelineInvalidated:
            return .cancelled
        case .dataMissingInCache:
            return .offlineOrMiss
        case .dataLoadingFailed(let underlying):
            return Self.projectDataLoadingError(underlying)
        case .dataIsEmpty:
            return .other("empty data")
        case .decoderNotRegistered, .decodingFailed:
            return .decodeFailed
        case .processingFailed:
            return .decodeFailed
        case .dataDownloadExceededMaximumSize:
            return .other("data size exceeded")
        case .imageRequestMissing:
            return .other("request missing")
        }
    }

    static func projectDataLoadingError(_ error: any Error) -> ImageLoadError {
        if let loaderError = error as? DataLoader.Error {
            if case .statusCodeUnacceptable(let code) = loaderError {
                return .invalidResponse(statusCode: code)
            }
        }
        // URLError 网络类错误统一降级为 offline/miss；其余保留为 unknown。
        if let urlError = error as? URLError {
            switch urlError.code {
            case .notConnectedToInternet, .networkConnectionLost, .internationalRoamingOff,
                 .timedOut, .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed,
                 .resourceUnavailable, .dataNotAllowed:
                return .offlineOrMiss
            default:
                return .other(urlError.localizedDescription)
            }
        }
        return .other(String(describing: error))
    }
}
