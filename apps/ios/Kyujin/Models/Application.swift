import Foundation

enum ApplicationStatus: String, Codable, CaseIterable, Hashable {
    case applied
    case noResponse = "no_response"
    case interview
    case rejected
    case accepted
    case obtained
}

struct Application: Identifiable, Hashable, Codable {
    let id: String
    let company: String
    let role: String?
    let status: ApplicationStatus
    let sourceDomain: String?
    let firstSeenAt: Date
    let lastEventAt: Date
}

struct Stats: Codable {
    let total: Int
    let responseRate: Double
    let ghostRate: Double
    let ghosted: Int
    let byStatus: [String: Int]
}
