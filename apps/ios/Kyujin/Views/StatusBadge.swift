import SwiftUI

struct StatusBadge: View {
    let status: ApplicationStatus

    var body: some View {
        Text(status.displayName)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(status.color.opacity(0.15))
            .foregroundStyle(status.color)
            .clipShape(Capsule())
    }
}

extension ApplicationStatus {
    var displayName: String {
        switch self {
        case .applied: "Applied"
        case .noResponse: "No response"
        case .interview: "Interview"
        case .rejected: "Rejected"
        case .accepted: "Offer"
        case .obtained: "Obtained"
        }
    }

    var color: Color {
        switch self {
        case .applied: .blue
        case .noResponse: .gray
        case .interview: .orange
        case .rejected: .red
        case .accepted, .obtained: .green
        }
    }
}
