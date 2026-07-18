// Trivial payload. The point of this package is not what it does,
// but WHO npm believes published it (see README — Trusted Publishing probe).
export const marker = "oidc-trust-probe";

export function whoPublished() {
  return marker;
}
