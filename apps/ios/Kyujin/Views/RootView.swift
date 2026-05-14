import SwiftUI

struct RootView: View {
    @EnvironmentObject private var auth: AuthManager

    var body: some View {
        Group {
            if auth.isAuthenticated {
                MainTabView()
            } else {
                LoginView()
            }
        }
        .task { await auth.restore() }
    }
}

struct MainTabView: View {
    var body: some View {
        TabView {
            NavigationStack {
                ApplicationsView()
            }
            .tabItem { Label("Applications", systemImage: "tray.full") }

            NavigationStack {
                InsightsView()
            }
            .tabItem { Label("Insights", systemImage: "chart.bar") }

            NavigationStack {
                SettingsView()
            }
            .tabItem { Label("Settings", systemImage: "gear") }
        }
    }
}
