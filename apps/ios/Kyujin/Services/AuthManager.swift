import Foundation
import AuthenticationServices

@MainActor
final class AuthManager: ObservableObject {
    @Published private(set) var isAuthenticated = false
    @Published private(set) var userEmail: String?

    func restore() async {
        isAuthenticated = KeychainHelper.shared.sessionToken != nil
        userEmail = KeychainHelper.shared.userEmail
    }

    func signInWithApple(result: Result<ASAuthorization, Error>) async throws {
        switch result {
        case .failure(let error):
            throw error
        case .success(let authorization):
            guard
                let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                let identityTokenData = credential.identityToken,
                let identityToken = String(data: identityTokenData, encoding: .utf8)
            else {
                throw APIError.notAuthenticated
            }

            let authorizationCode = credential.authorizationCode.flatMap { String(data: $0, encoding: .utf8) }
            let fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
                .compactMap { $0 }
                .joined(separator: " ")
                .nilIfEmpty()

            let exchange = try await APIClient.shared.exchangeAppleCredential(
                idToken: identityToken,
                authorizationCode: authorizationCode,
                fullName: fullName
            )

            KeychainHelper.shared.sessionToken = exchange.sessionToken
            KeychainHelper.shared.userEmail = exchange.email
            userEmail = exchange.email
            isAuthenticated = true
        }
    }

    func signOut() async {
        KeychainHelper.shared.sessionToken = nil
        KeychainHelper.shared.userEmail = nil
        userEmail = nil
        isAuthenticated = false
    }
}

private extension String {
    func nilIfEmpty() -> String? {
        isEmpty ? nil : self
    }
}
