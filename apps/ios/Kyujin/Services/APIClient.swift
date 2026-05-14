import Foundation

enum APIError: LocalizedError {
    case notAuthenticated
    case badStatus(Int)
    case decoding(Error)

    var errorDescription: String? {
        switch self {
        case .notAuthenticated: "Not signed in."
        case .badStatus(let code): "Server returned \(code)."
        case .decoding(let err): "Couldn't read server response: \(err.localizedDescription)"
        }
    }
}

@MainActor
final class APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private let decoder: JSONDecoder
    private let baseURL: URL

    private init() {
        let config = URLSessionConfiguration.default
        config.waitsForConnectivity = true
        self.session = URLSession(configuration: config)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        self.decoder = decoder

        // Read AppConfig.plist or fall back to localhost. Override the
        // `KYUJIN_API_BASE_URL` env var in Xcode → Scheme → Run → Arguments
        // for device testing against a tunnel (ngrok, cloudflared, etc.).
        let raw = ProcessInfo.processInfo.environment["KYUJIN_API_BASE_URL"]
            ?? Bundle.main.object(forInfoDictionaryKey: "KyujinAPIBaseURL") as? String
            ?? "http://localhost:3000"
        self.baseURL = URL(string: raw)!
    }

    // MARK: - Public endpoints (require Bearer token)

    func fetchApplications() async throws -> [Application] {
        try await get("/api/applications", as: ApplicationsResponse.self).applications
    }

    func fetchStats() async throws -> Stats {
        try await get("/api/stats", as: Stats.self)
    }

    func exchangeAppleCredential(idToken: String, authorizationCode: String?, fullName: String?) async throws -> AuthExchange {
        let body = AppleExchangeRequest(idToken: idToken, authorizationCode: authorizationCode, fullName: fullName)
        return try await post("/api/auth/ios-apple", body: body, as: AuthExchange.self, authenticated: false)
    }

    func gmailConnectURL() -> URL? {
        guard let token = KeychainHelper.shared.sessionToken else { return nil }
        // The web flow attaches the cookie via redirect; for the iOS sheet we
        // hand the bearer token in the URL fragment so the web side can pin a
        // short-lived session before redirecting to Google.
        return baseURL.appending(path: "/api/gmail/connect").appending(
            queryItems: [URLQueryItem(name: "token", value: token)]
        )
    }

    // MARK: - Plumbing

    private func get<T: Decodable>(_ path: String, as type: T.Type) async throws -> T {
        var request = URLRequest(url: baseURL.appending(path: path))
        try attachAuth(&request)
        return try await perform(request)
    }

    private func post<Body: Encodable, T: Decodable>(
        _ path: String,
        body: Body,
        as type: T.Type,
        authenticated: Bool = true
    ) async throws -> T {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        if authenticated {
            try attachAuth(&request)
        }
        return try await perform(request)
    }

    private func attachAuth(_ request: inout URLRequest) throws {
        guard let token = KeychainHelper.shared.sessionToken else {
            throw APIError.notAuthenticated
        }
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    }

    private func perform<T: Decodable>(_ request: URLRequest) async throws -> T {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.badStatus(0)
        }
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.badStatus(http.statusCode)
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }
}

// MARK: - Wire types

struct ApplicationsResponse: Codable {
    let applications: [Application]
}

struct AppleExchangeRequest: Codable {
    let idToken: String
    let authorizationCode: String?
    let fullName: String?
}

struct AuthExchange: Codable {
    let sessionToken: String
    let email: String?
}
