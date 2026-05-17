import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from '@apple/app-store-server-library';
import type { BillingCadence, PlanId } from './plans';

// Wrapper around Apple's official SDK. Two SDK pieces matter:
//   - SignedDataVerifier: verifies + decodes JWS payloads (transactions,
//     renewal info, S2S notifications) against Apple's root cert chain.
//     Constructed lazily so a missing env var only breaks billing requests,
//     not the whole process.
//   - AppStoreServerAPIClient: pulls current subscription status from
//     Apple. We call it from the verify endpoint to confirm a transaction
//     the iOS client claims to have made is still active.

function parseEnvironment(value: string | undefined): Environment {
  // Apple's enum stringifies as the exact words "Sandbox" and "Production".
  // Default to Sandbox in dev so a wrong env var can't accidentally talk
  // to production with TestFlight credentials.
  return value === 'Production' ? Environment.PRODUCTION : Environment.SANDBOX;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) throw new Error(`${name} is not set`);
  return v;
}

function rootCertificates(): Buffer[] {
  const b64 = process.env.APPLE_ROOT_CERT_BASE64;
  if (!b64) {
    throw new Error(
      'APPLE_ROOT_CERT_BASE64 is not set. Download AppleRootCA-G3.cer from https://www.apple.com/certificateauthority/ and set the base64 of that file.',
    );
  }
  return [Buffer.from(b64, 'base64')];
}

let _verifier: SignedDataVerifier | null = null;
export function getVerifier(): SignedDataVerifier {
  if (_verifier) return _verifier;
  const env = parseEnvironment(process.env.APPLE_ENVIRONMENT);
  const bundleId = requireEnv('APPLE_BUNDLE_ID');
  const appAppleId = process.env.APPLE_APP_APPLE_ID
    ? Number(process.env.APPLE_APP_APPLE_ID)
    : undefined;
  // enableOnlineChecks does OCSP cert revocation. Slower (extra TLS round
  // trips) but required for security in production. Keep on always — the
  // SDK caches the public keys it derives.
  _verifier = new SignedDataVerifier(rootCertificates(), true, env, bundleId, appAppleId);
  return _verifier;
}

let _apiClient: AppStoreServerAPIClient | null = null;
export function getAppleApi(): AppStoreServerAPIClient {
  if (_apiClient) return _apiClient;
  // Newlines in P8 keys get escaped to literal \n when stuffed into .env;
  // restore them before passing to the SDK.
  const rawKey = requireEnv('APPLE_PRIVATE_KEY');
  const signingKey = rawKey.includes('\\n') ? rawKey.replace(/\\n/g, '\n') : rawKey;
  const keyId = requireEnv('APPLE_KEY_ID');
  const issuerId = requireEnv('APPLE_ISSUER_ID');
  const bundleId = requireEnv('APPLE_BUNDLE_ID');
  const env = parseEnvironment(process.env.APPLE_ENVIRONMENT);
  _apiClient = new AppStoreServerAPIClient(signingKey, keyId, issuerId, bundleId, env);
  return _apiClient;
}

export interface AppleProductConfig {
  planId: PlanId;
  cadence: BillingCadence;
}

function envKeyForProduct(planId: PlanId, cadence: BillingCadence): string {
  return `APPLE_PRODUCT_${planId.toUpperCase()}_${cadence.toUpperCase()}`;
}

export function appleProductIdFor(planId: PlanId, cadence: BillingCadence): string | null {
  const v = process.env[envKeyForProduct(planId, cadence)];
  return v && v.length > 0 ? v : null;
}

// Reverse map: which (plan, cadence) does an Apple product ID represent?
// Used by the webhook + verify endpoint to translate
// `JWSTransactionDecodedPayload.productId` into a plan we can write.
export function appleProductConfigFor(productId: string): AppleProductConfig | null {
  for (const planId of ['standard', 'premium'] as const) {
    for (const cadence of ['monthly', 'annual'] as const) {
      if (appleProductIdFor(planId, cadence) === productId) {
        return { planId, cadence };
      }
    }
  }
  return null;
}

// Re-exports so callers (route handlers) don't need a direct dependency on
// the SDK's module tree.
export { Environment, type JWSTransactionDecodedPayload, type ResponseBodyV2DecodedPayload };
