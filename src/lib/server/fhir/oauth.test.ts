import { describe, it, expect, vi } from "vitest";
import { encodeOAuthState, decodeOAuthState, type OAuthState } from "./oauth";

// Mock the config
vi.mock("./config", () => ({
	fhirConfig: {
		googleClientId: "test-client-id",
		googleClientSecret: "test-secret",
		smartEnabled: true,
		smartScopes: "openid fhirUser patient/Patient.read",
		publicOrigin: "https://example.com",
	},
}));

vi.mock("$lib/server/config", () => ({
	config: {
		PUBLIC_ORIGIN: "https://example.com",
	},
}));

vi.mock("$app/paths", () => ({
	base: "",
}));

vi.mock("$lib/server/logger", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

vi.mock("$lib/utils/sha256", () => ({
	sha256: async (input: string) => {
		const encoder = new TextEncoder();
		const data = encoder.encode(input);
		const hash = await crypto.subtle.digest("SHA-256", data);
		return Array.from(new Uint8Array(hash))
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
	},
}));

describe("OAuth State Encoding", () => {
	const testState: OAuthState = {
		sessionId: "test-session-123",
		provider: "google",
		codeVerifier: "test-verifier",
		redirectUri: "https://example.com/api/fhir/auth/callback",
		nonce: "test-nonce",
		next: "/dashboard",
	};

	it("should encode and decode state correctly", async () => {
		const encoded = await encodeOAuthState(testState);
		expect(typeof encoded).toBe("string");
		expect(encoded.length).toBeGreaterThan(0);

		const decoded = await decodeOAuthState(encoded);
		expect(decoded).not.toBeNull();
		expect(decoded?.sessionId).toBe(testState.sessionId);
		expect(decoded?.provider).toBe(testState.provider);
		expect(decoded?.codeVerifier).toBe(testState.codeVerifier);
		expect(decoded?.redirectUri).toBe(testState.redirectUri);
		expect(decoded?.nonce).toBe(testState.nonce);
		expect(decoded?.next).toBe(testState.next);
	});

	it("should reject tampered state", async () => {
		const encoded = await encodeOAuthState(testState);
		// Tamper with the encoded state
		const tampered = encoded.slice(0, -5) + "XXXXX";
		const decoded = await decodeOAuthState(tampered);
		expect(decoded).toBeNull();
	});

	it("should reject invalid base64", async () => {
		const decoded = await decodeOAuthState("not-valid-base64!!!");
		expect(decoded).toBeNull();
	});

	it("should handle SMART on FHIR state with fhirServerUrl", async () => {
		const smartState: OAuthState = {
			...testState,
			provider: "smart-on-fhir",
			fhirServerUrl: "https://fhir.example.com/r4",
		};

		const encoded = await encodeOAuthState(smartState);
		const decoded = await decodeOAuthState(encoded);
		expect(decoded?.provider).toBe("smart-on-fhir");
		expect(decoded?.fhirServerUrl).toBe("https://fhir.example.com/r4");
	});
});
