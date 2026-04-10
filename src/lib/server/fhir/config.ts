import { z } from "zod";
import { config } from "$lib/server/config";

/**
 * FHIR Backend Configuration
 *
 * All FHIR-related settings are drawn from environment variables, consistent
 * with the rest of chat-ui's config pattern. Values are validated at import
 * time so misconfigurations surface early.
 */
export const fhirConfig = z
	.object({
		// ── Core FHIR server ────────────────────────────────────────────
		/** Base URL of the FHIR R4 server (e.g. Google Healthcare API) */
		serverUrl: z.string().url().optional(),

		/** FHIR server version — only R4 is supported for RFP compliance */
		fhirVersion: z.literal("4.0.1").default("4.0.1"),

		// ── Google Cloud Healthcare API ─────────────────────────────────
		/** Google Cloud project ID */
		googleProjectId: z.string().optional(),
		/** Google Cloud location (e.g. us-central1) */
		googleLocation: z.string().default("us-central1"),
		/** Google Cloud Healthcare dataset ID */
		googleDatasetId: z.string().optional(),
		/** Google Healthcare FHIR store ID */
		googleFhirStoreId: z.string().optional(),

		// ── Google OAuth 2.0 for FHIR ───────────────────────────────────
		/** Google OAuth client ID */
		googleClientId: z.string().optional(),
		/** Google OAuth client secret */
		googleClientSecret: z.string().optional(),
		/** Google service account key JSON (for server-to-server auth) */
		googleServiceAccountKey: z.string().optional(),

		// ── SMART on FHIR ───────────────────────────────────────────────
		/** Enable SMART on FHIR authorization */
		smartEnabled: z.boolean().default(false),
		/** SMART on FHIR scopes (space-separated) */
		smartScopes: z
			.string()
			.default(
				"openid fhirUser launch/patient patient/Patient.read patient/Observation.read patient/Condition.read"
			),

		// ── Compliance & Security ───────────────────────────────────────
		/** Enable HIPAA audit logging */
		auditEnabled: z.boolean().default(true),
		/** Maximum audit log retention in days */
		auditRetentionDays: z.number().int().positive().default(2555), // ~7 years per HIPAA
		/** Require TLS for all FHIR connections */
		requireTls: z.boolean().default(true),
		/** Enable request rate limiting for FHIR endpoints */
		rateLimitEnabled: z.boolean().default(true),
		/** Max FHIR requests per minute per session */
		rateLimitPerMinute: z.number().int().positive().default(60),
		/** Enable patient consent enforcement */
		consentEnabled: z.boolean().default(true),

		// ── Proxy / Gateway ─────────────────────────────────────────────
		/** Public origin for building callback URLs */
		publicOrigin: z.string().optional(),
	})
	.parse({
		serverUrl: config.FHIR_SERVER_URL || undefined,
		fhirVersion: "4.0.1",
		googleProjectId: config.FHIR_GOOGLE_PROJECT_ID || undefined,
		googleLocation: config.FHIR_GOOGLE_LOCATION || "us-central1",
		googleDatasetId: config.FHIR_GOOGLE_DATASET_ID || undefined,
		googleFhirStoreId: config.FHIR_GOOGLE_FHIR_STORE_ID || undefined,
		googleClientId: config.FHIR_GOOGLE_CLIENT_ID || undefined,
		googleClientSecret: config.FHIR_GOOGLE_CLIENT_SECRET || undefined,
		googleServiceAccountKey: config.FHIR_GOOGLE_SERVICE_ACCOUNT_KEY || undefined,
		smartEnabled: config.FHIR_SMART_ENABLED === "true",
		smartScopes: config.FHIR_SMART_SCOPES || undefined,
		auditEnabled: config.FHIR_AUDIT_ENABLED !== "false",
		auditRetentionDays: config.FHIR_AUDIT_RETENTION_DAYS
			? parseInt(config.FHIR_AUDIT_RETENTION_DAYS)
			: 2555,
		requireTls: config.FHIR_REQUIRE_TLS !== "false",
		rateLimitEnabled: config.FHIR_RATE_LIMIT_ENABLED !== "false",
		rateLimitPerMinute: config.FHIR_RATE_LIMIT_PER_MINUTE
			? parseInt(config.FHIR_RATE_LIMIT_PER_MINUTE)
			: 60,
		consentEnabled: config.FHIR_CONSENT_ENABLED !== "false",
		publicOrigin: config.PUBLIC_ORIGIN || undefined,
	});

/**
 * Builds the Google Healthcare API FHIR store base URL.
 * Format: https://healthcare.googleapis.com/v1/projects/{project}/locations/{location}/datasets/{dataset}/fhirStores/{store}/fhir
 */
export function getGoogleFhirBaseUrl(): string {
	const { googleProjectId, googleLocation, googleDatasetId, googleFhirStoreId } = fhirConfig;
	if (!googleProjectId || !googleDatasetId || !googleFhirStoreId) {
		throw new Error(
			"Google Healthcare API config incomplete: FHIR_GOOGLE_PROJECT_ID, FHIR_GOOGLE_DATASET_ID, and FHIR_GOOGLE_FHIR_STORE_ID are required"
		);
	}
	return `https://healthcare.googleapis.com/v1/projects/${googleProjectId}/locations/${googleLocation}/datasets/${googleDatasetId}/fhirStores/${googleFhirStoreId}/fhir`;
}

/**
 * Returns the effective FHIR server base URL.
 * Prefers explicit FHIR_SERVER_URL; falls back to building a Google Healthcare URL.
 */
export function getFhirBaseUrl(): string {
	if (fhirConfig.serverUrl) {
		return fhirConfig.serverUrl;
	}
	return getGoogleFhirBaseUrl();
}

export function isFhirConfigured(): boolean {
	return !!(
		fhirConfig.serverUrl ||
		(fhirConfig.googleProjectId && fhirConfig.googleDatasetId && fhirConfig.googleFhirStoreId)
	);
}
