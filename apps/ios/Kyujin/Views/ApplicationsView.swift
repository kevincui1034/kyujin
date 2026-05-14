import SwiftUI

struct ApplicationsView: View {
    @StateObject private var viewModel = ApplicationsViewModel()

    var body: some View {
        Group {
            switch viewModel.state {
            case .loading:
                ProgressView().controlSize(.large)
            case .error(let message):
                ContentUnavailableView(
                    "Couldn't load applications",
                    systemImage: "exclamationmark.triangle",
                    description: Text(message)
                )
            case .empty:
                ContentUnavailableView(
                    "No applications yet",
                    systemImage: "tray",
                    description: Text("Connect Gmail in Settings to start tracking.")
                )
            case .loaded(let apps):
                List(apps) { app in
                    NavigationLink(value: app) {
                        ApplicationRow(application: app)
                    }
                }
                .navigationDestination(for: Application.self) { app in
                    ApplicationDetailView(application: app)
                }
                .refreshable { await viewModel.load() }
            }
        }
        .navigationTitle("Applications")
        .task { await viewModel.load() }
    }
}

private struct ApplicationRow: View {
    let application: Application

    var body: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 2) {
                Text(application.company).font(.headline)
                if let role = application.role {
                    Text(role).font(.subheadline).foregroundStyle(.secondary)
                }
            }
            Spacer()
            StatusBadge(status: application.status)
        }
        .padding(.vertical, 4)
    }
}

@MainActor
final class ApplicationsViewModel: ObservableObject {
    enum State {
        case loading
        case empty
        case loaded([Application])
        case error(String)
    }

    @Published var state: State = .loading

    func load() async {
        state = .loading
        do {
            let apps = try await APIClient.shared.fetchApplications()
            state = apps.isEmpty ? .empty : .loaded(apps)
        } catch {
            state = .error(error.localizedDescription)
        }
    }
}
