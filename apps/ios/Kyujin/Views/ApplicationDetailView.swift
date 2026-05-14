import SwiftUI

struct ApplicationDetailView: View {
    let application: Application

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                HStack {
                    VStack(alignment: .leading) {
                        Text(application.company).font(.title2).bold()
                        if let role = application.role {
                            Text(role).foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                    StatusBadge(status: application.status)
                }
                .padding(.horizontal)

                Divider()

                VStack(alignment: .leading, spacing: 4) {
                    Label("First seen", systemImage: "calendar")
                    Text(application.firstSeenAt.formatted(date: .abbreviated, time: .omitted))
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal)

                VStack(alignment: .leading, spacing: 4) {
                    Label("Last event", systemImage: "clock")
                    Text(application.lastEventAt.formatted(date: .abbreviated, time: .shortened))
                        .foregroundStyle(.secondary)
                }
                .padding(.horizontal)

                Spacer(minLength: 40)
            }
            .padding(.top)
        }
        .navigationTitle(application.company)
        .navigationBarTitleDisplayMode(.inline)
    }
}
