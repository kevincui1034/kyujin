import SwiftUI
import SafariServices

struct SettingsView: View {
    @EnvironmentObject private var auth: AuthManager
    @State private var showingGmailConnect = false

    var body: some View {
        Form {
            Section("Gmail") {
                Button {
                    showingGmailConnect = true
                } label: {
                    Label("Connect Gmail", systemImage: "envelope.badge")
                }
                Text("Kyujin reads job-application emails only — never sends mail on your behalf.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Account") {
                if let email = auth.userEmail {
                    LabeledContent("Email", value: email)
                }
                Button("Sign out", role: .destructive) {
                    Task { await auth.signOut() }
                }
            }

            Section {
                LabeledContent("Version", value: Bundle.main.shortVersion)
            }
        }
        .navigationTitle("Settings")
        .sheet(isPresented: $showingGmailConnect) {
            if let url = APIClient.shared.gmailConnectURL() {
                SafariView(url: url)
            }
        }
    }
}

private struct SafariView: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController {
        SFSafariViewController(url: url)
    }
    func updateUIViewController(_ uiViewController: SFSafariViewController, context: Context) {}
}

private extension Bundle {
    var shortVersion: String {
        infoDictionary?["CFBundleShortVersionString"] as? String ?? "—"
    }
}
