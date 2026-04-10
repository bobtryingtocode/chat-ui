import { fhirConfig } from "./config";
import { logger } from "$lib/server/logger";
import { sha256 } from "$lib/utils/sha256";
import { base } from "$app/paths";

/**
 * FHIR OAuth 2.0 Module
 *
 * Supports two authorization flows required by the FHIR RFP:
 *
 * 1. **Google OAuth 2.0** — For accessing Google Cloud Healthcare API.
 *    Uses standard Google OAuth with healthcare-specific scopes.
 *
 * 2. **SMART on FHIR** — The HL7-standard authorization framework for
 *    healthcare apps (https://hl7.org/fhir/smart-app-launch/).
 *    Supports standalone launch and EHR launch sequences.
 *
 * Both flows produce access tokens that are stored in the fhirOAuthTokens
 * collection and automatically refreshed before expiry.
 */

// ── Google OAuth Constants ──────────────────────────────────────────────────

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

/** Google scopes needed for Healthcare API + user identity */
const GOOGLE_HEALTHCARE_SCOPES = [
	"openid",
	"email",
	"profile",
	"https://www.googleapis.com/auth/cloud-healthcare",
].join(" ");

// ── SMART on FHIR Constants ────────────────────────────────────────────────

const SMART_WELL_KNOWN_PATH = "/.well-known/smart-configuration";

// ── Types ───────────────────────────────────────────────────────────────────

export interface OAuthTokenResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
	refresh_token?: string;
	scope?: string;
	id_token?: string;
	patient?: string; // SMART on FHIR: launched patient context
}

export interface OAuthState {
	sessionId: string;
	provider: "google" | "smart-on-fhir";
	codeVerifier: string;
	redirectUri: string;
	nonce: string;
	next?: string;
	fhirServerUrl?: string;
}

interface SmartConfiguration {
	authorization_endpoint: string;
	token_endpoint: string;
	token_endpoint_auth_methods_supported?: string[];
	registration_endpoint?: string;
	scopes_supported?: string[];
	response_types_supported?: string[];
	capabilities?: string[];
}

// ── PKCE Helpers ────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
	const array = new Uint8Array(32);
	crypto.getRandomValues(array);
	return base64UrlEncode(array);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(verifier);
	const digest = await crypto.subtle.digest("SHA-256", data);
	return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(buffer: Uint8Array): string {
	let str = "";
	for (const byte of buffer) {
		str += String.fromCharCode(byte);
	}
	return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateNonce(): string {
	const array = new Uint8Array(16);
	crypto.getRandomValues(array);
	return Array.from(array)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

// ── State encoding (CSRF-safe) ──────────────────────────────────────────────

export async function encodeOAuthState(state: OAuthState): Promise<string> {
	const payload = JSON.stringify(state);
	const signature = await sha256(payload + "##fhir-oauth");
	return Buffer.from(JSON.stringify({ data: payload, sig: signature })).toString("base64");
}

export async function decodeOAuthState(encoded: string): Promise<OAuthState | null> {
	try {
		const { data, sig } = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
		const expectedSig = await sha256(data + "##fhir-oauth");
		if (sig !== expectedSig) {
			logger.warn("FHIR OAuth state signature mismatch");
			return null;
		}
		return JSON.parse(data) as OAuthState;
	} catch {
		logger.error("Failed to decode FHIR OAuth state");
		return null;
	}
}

// ── Callback URL builder ────────────────────────────────────────────────────

export function getFhirCallbackUrl(origin?: string): string {
	const publicOrigin = origin || fhirConfig.publicOrigin || "";
	return `${publicOrigin}${base}/api/fhir/auth/callback`;
}

// ── Google OAuth Flow ───────────────────────────────────────────────────────

export async function getGoogleAuthorizationUrl(params: {
	sessionId: string;
	next?: string;
	origin: string;
}): Promise<{ url: string; state: OAuthState }> {
	const { googleClientId } = fhirConfig;
	if (!googleClientId) {
		throw new Error("FHIR_GOOGLE_CLIENT_ID is required for Google OAuth");
	}

	const codeVerifier = generateCodeVerifier();
	const codeChallenge = await generateCodeChallenge(codeVerifier);
	const nonce = generateNonce();
	const redirectUri = getFhirCallbackUrl(params.origin);

	const state: OAuthState = {
		sessionId: params.sessionId,
		provider: "google",
		codeVerifier,
		redirectUri,
		nonce,
		next: params.next,
	};

	const encodedState = await encodeOAuthState(state);

	const url = new URL(GOOGLE_AUTH_URL);
	url.searchParams.set("client_id", googleClientId);
	url.searchParams.set("redirect_uri", redirectUri);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("scope", GOOGLE_HEALTHCARE_SCOPES);
	url.searchParams.set("state", encodedState);
	url.searchParams.set("code_challenge", codeChallenge);
	url.searchParams.set("code_challenge_method", "S256");
	url.searchParams.set("nonce", nonce);
	url.searchParams.set("access_type", "offline");
	url.searchParams.set("prompt", "consent");

	return { url: url.toString(), state };
}

export async function exchangeGoogleCode(
	code: string,
	redirectUri: string,
	codeVerifier: string
): Promise<OAuthTokenResponse> {
	const { googleClientId, googleClientSecret } = fhirConfig;
	if (!googleClientId || !googleClientSecret) {
		throw new Error("Google OAuth client credentials not configured");
	}

	const response = await fetch(GOOGLE_TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "authorization_code",
			code,
			redirect_uri: redirectUri,
			client_id: googleClientId,
			client_secret: googleClientSecret,
			code_verifier: codeVerifier,
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		logger.error({ status: response.status, body }, "Google token exchange failed");
		throw new Error(`Google token exchange failed: ${response.status}`);
	}

	return (await response.json()) as OAuthTokenResponse;
}

export async function refreshGoogleToken(refreshToken: string): Promise<OAuthTokenResponse> {
	const { googleClientId, googleClientSecret } = fhirConfig;
	if (!googleClientId || !googleClientSecret) {
		throw new Error("Google OAuth client credentials not configured");
	}

	const response = await fetch(GOOGLE_TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			client_id: googleClientId,
			client_secret: googleClientSecret,
		}),
	});

	if (!response.ok) {
		const body = await response.text();
		logger.error({ status: response.status, body }, "Google token refresh failed");
		throw new Error(`Google token refresh failed: ${response.status}`);
	}

	return (await response.json()) as OAuthTokenResponse;
}

export async function getGoogleUserInfo(
	accessToken: string
): Promise<{ sub: string; email: string; name: string; picture?: string }> {
	const response = await fetch(GOOGLE_USERINFO_URL, {
		headers: { Authorization: `Bearer ${accessToken}` },
	});

	if (!response.ok) {
		throw new Error(`Failed to fetch Google user info: ${response.status}`);
	}

	return response.json();
}

// ── Google Service Account (server-to-server) ───────────────────────────────

export async function getServiceAccountToken(): Promise<string> {
	const keyJson = fhirConfig.googleServiceAccountKey;
	if (!keyJson) {
		throw new Error("FHIR_GOOGLE_SERVICE_ACCOUNT_KEY is required for service account auth");
	}

	const key = JSON.parse(keyJson) as {
		client_email: string;
		private_key: string;
		token_uri: string;
	};

	const now = Math.floor(Date.now() / 1000);
	const header = { alg: "RS256", typ: "JWT" };
	const payload = {
		iss: key.client_email,
		scope: "https://www.googleapis.com/auth/cloud-healthcare",
		aud: key.token_uri,
		iat: now,
		exp: now + 3600,
	};

	const jwt = await signJwt(header, payload, key.private_key);

	const response = await fetch(key.token_uri, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
			assertion: jwt,
		}),
	});

	if (!response.ok) {
		throw new Error(`Service account token request failed: ${response.status}`);
	}

	const data = (await response.json()) as { access_token: string };
	return data.access_token;
}

async function signJwt(
	header: Record<string, string>,
	payload: Record<string, string | number>,
	privateKeyPem: string
): Promise<string> {
	const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
	const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
	const signingInput = `${encodedHeader}.${encodedPayload}`;

	// Import PEM private key
	const pemContents = privateKeyPem
		.replace(/-----BEGIN PRIVATE KEY-----/g, "")
		.replace(/-----END PRIVATE KEY-----/g, "")
		.replace(/\s/g, "");
	const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

	const cryptoKey = await crypto.subtle.importKey(
		"pkcs8",
		binaryKey,
		{ name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
		false,
		["sign"]
	);

	const signature = await crypto.subtle.sign(
		"RSASSA-PKCS1-v1_5",
		cryptoKey,
		new TextEncoder().encode(signingInput)
	);

	return `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;
}

// ── SMART on FHIR Flow ──────────────────────────────────────────────────────

export async function discoverSmartConfiguration(
	fhirServerUrl: string
): Promise<SmartConfiguration> {
	const url = `${fhirServerUrl.replace(/\/$/, "")}${SMART_WELL_KNOWN_PATH}`;
	const response = await fetch(url, {
		headers: { Accept: "application/json" },
	});

	if (!response.ok) {
		throw new Error(`SMART configuration discovery failed: ${response.status} from ${url}`);
	}

	return (await response.json()) as SmartConfiguration;
}

export async function getSmartAuthorizationUrl(params: {
	fhirServerUrl: string;
	sessionId: string;
	origin: string;
	next?: string;
	launch?: string;
}): Promise<{ url: string; state: OAuthState }> {
	const smartConfig = await discoverSmartConfiguration(params.fhirServerUrl);

	const codeVerifier = generateCodeVerifier();
	const codeChallenge = await generateCodeChallenge(codeVerifier);
	const nonce = generateNonce();
	const redirectUri = getFhirCallbackUrl(params.origin);

	const state: OAuthState = {
		sessionId: params.sessionId,
		provider: "smart-on-fhir",
		codeVerifier,
		redirectUri,
		nonce,
		next: params.next,
		fhirServerUrl: params.fhirServerUrl,
	};

	const encodedState = await encodeOAuthState(state);

	const url = new URL(smartConfig.authorization_endpoint);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("client_id", fhirConfig.googleClientId || "");
	url.searchParams.set("redirect_uri", redirectUri);
	url.searchParams.set("scope", fhirConfig.smartScopes);
	url.searchParams.set("state", encodedState);
	url.searchParams.set("aud", params.fhirServerUrl);
	url.searchParams.set("code_challenge", codeChallenge);
	url.searchParams.set("code_challenge_method", "S256");

	if (params.launch) {
		url.searchParams.set("launch", params.launch);
	}

	return { url: url.toString(), state };
}

export async function exchangeSmartCode(params: {
	code: string;
	fhirServerUrl: string;
	redirectUri: string;
	codeVerifier: string;
}): Promise<OAuthTokenResponse> {
	const smartConfig = await discoverSmartConfiguration(params.fhirServerUrl);
	const { googleClientId, googleClientSecret } = fhirConfig;

	const body: Record<string, string> = {
		grant_type: "authorization_code",
		code: params.code,
		redirect_uri: params.redirectUri,
		code_verifier: params.codeVerifier,
	};

	if (googleClientId) {
		body.client_id = googleClientId;
	}

	const headers: Record<string, string> = {
		"Content-Type": "application/x-www-form-urlencoded",
	};

	// Use basic auth if client secret is available
	if (googleClientId && googleClientSecret) {
		headers["Authorization"] = `Basic ${btoa(`${googleClientId}:${googleClientSecret}`)}`;
	}

	const response = await fetch(smartConfig.token_endpoint, {
		method: "POST",
		headers,
		body: new URLSearchParams(body),
	});

	if (!response.ok) {
		const responseBody = await response.text();
		logger.error({ status: response.status, body: responseBody }, "SMART token exchange failed");
		throw new Error(`SMART token exchange failed: ${response.status}`);
	}

	return (await response.json()) as OAuthTokenResponse;
}

export async function refreshSmartToken(params: {
	refreshToken: string;
	fhirServerUrl: string;
}): Promise<OAuthTokenResponse> {
	const smartConfig = await discoverSmartConfiguration(params.fhirServerUrl);
	const { googleClientId, googleClientSecret } = fhirConfig;

	const body: Record<string, string> = {
		grant_type: "refresh_token",
		refresh_token: params.refreshToken,
	};

	if (googleClientId) {
		body.client_id = googleClientId;
	}

	const headers: Record<string, string> = {
		"Content-Type": "application/x-www-form-urlencoded",
	};

	if (googleClientId && googleClientSecret) {
		headers["Authorization"] = `Basic ${btoa(`${googleClientId}:${googleClientSecret}`)}`;
	}

	const response = await fetch(smartConfig.token_endpoint, {
		method: "POST",
		headers,
		body: new URLSearchParams(body),
	});

	if (!response.ok) {
		throw new Error(`SMART token refresh failed: ${response.status}`);
	}

	return (await response.json()) as OAuthTokenResponse;
}

// ── Token Resolution ────────────────────────────────────────────────────────

/**
 * Resolves a valid FHIR access token for the current session.
 * Checks for stored OAuth tokens, refreshes if needed, falls back to service account.
 */
export async function resolveAccessToken(params: {
	userId?: string;
	sessionId: string;
	getFhirToken: () => Promise<
		| {
				accessToken: string;
				refreshToken?: string;
				expiresAt: Date;
				provider: "google" | "smart-on-fhir";
				fhirServerUrl?: string;
		  }
		| undefined
	>;
	updateFhirToken: (token: {
		accessToken: string;
		refreshToken?: string;
		expiresAt: Date;
	}) => Promise<void>;
}): Promise<string> {
	const stored = await params.getFhirToken();

	if (stored) {
		// Token still valid (with 5-minute buffer)
		if (stored.expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
			return stored.accessToken;
		}

		// Try refresh
		if (stored.refreshToken) {
			try {
				let tokenResponse: OAuthTokenResponse;
				if (stored.provider === "google") {
					tokenResponse = await refreshGoogleToken(stored.refreshToken);
				} else {
					tokenResponse = await refreshSmartToken({
						refreshToken: stored.refreshToken,
						fhirServerUrl: stored.fhirServerUrl || "",
					});
				}

				const newToken = {
					accessToken: tokenResponse.access_token,
					refreshToken: tokenResponse.refresh_token || stored.refreshToken,
					expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
				};

				await params.updateFhirToken(newToken);
				return newToken.accessToken;
			} catch (err) {
				logger.error(err, "FHIR token refresh failed, falling back to service account");
			}
		}
	}

	// Fallback: service account
	if (fhirConfig.googleServiceAccountKey) {
		return getServiceAccountToken();
	}

	throw new Error(
		"No valid FHIR access token available. Please authenticate via /api/fhir/auth/authorize"
	);
}
