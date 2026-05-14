import SwiftUI
import Charts

struct InsightsView: View {
    @StateObject private var viewModel = InsightsViewModel()

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                switch viewModel.state {
                case .loading:
                    ProgressView().padding(.top, 60)
                case .error(let message):
                    Text(message).foregroundStyle(.red)
                case .loaded(let stats):
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                        KPICard(title: "Total", value: "\(stats.total)")
                        KPICard(title: "Response rate", value: "\(Int(stats.responseRate * 100))%")
                        KPICard(title: "Interviews", value: "\(stats.byStatus["interview"] ?? 0)")
                        KPICard(title: "Ghost rate", value: "\(Int(stats.ghostRate * 100))%")
                    }
                    .padding(.horizontal)

                    GroupBox("Funnel") {
                        Chart {
                            BarMark(x: .value("Count", stats.total), y: .value("Stage", "Applied"))
                            BarMark(
                                x: .value("Count", (stats.byStatus["interview"] ?? 0)
                                          + (stats.byStatus["accepted"] ?? 0)
                                          + (stats.byStatus["obtained"] ?? 0)),
                                y: .value("Stage", "Interview"))
                            BarMark(
                                x: .value("Count", (stats.byStatus["accepted"] ?? 0)
                                          + (stats.byStatus["obtained"] ?? 0)),
                                y: .value("Stage", "Offer"))
                        }
                        .frame(height: 160)
                    }
                    .padding(.horizontal)
                }
            }
            .padding(.top)
        }
        .navigationTitle("Insights")
        .task { await viewModel.load() }
        .refreshable { await viewModel.load() }
    }
}

private struct KPICard: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.title.bold())
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}

@MainActor
final class InsightsViewModel: ObservableObject {
    enum State {
        case loading
        case loaded(Stats)
        case error(String)
    }

    @Published var state: State = .loading

    func load() async {
        state = .loading
        do {
            let stats = try await APIClient.shared.fetchStats()
            state = .loaded(stats)
        } catch {
            state = .error(error.localizedDescription)
        }
    }
}
