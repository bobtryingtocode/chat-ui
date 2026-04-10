/**
 * FHIR Backend Module
 *
 * Barrel export for the FHIR integration platform.
 * Provides FHIR R4-compliant API gateway with:
 * - Google Cloud Healthcare API integration
 * - SMART on FHIR / Google OAuth 2.0 authorization
 * - HIPAA-compliant audit logging
 * - Patient consent management
 */

export { fhirConfig, isFhirConfigured, getFhirBaseUrl } from "./config";
export { createFhirClient, FhirError, type FhirClient } from "./client";
export {
	getGoogleAuthorizationUrl,
	exchangeGoogleCode,
	refreshGoogleToken,
	getSmartAuthorizationUrl,
	exchangeSmartCode,
	resolveAccessToken,
	decodeOAuthState,
	encodeOAuthState,
} from "./oauth";
export { recordAuditEvent, queryAuditLogs, setAuditCollection } from "./audit";
export {
	getFhirClient,
	fhirError,
	fhirJsonResponse,
	requireFhirAuth,
	requireFhirConfigured,
	auditFhirRequest,
	checkPatientConsent,
} from "./middleware";
export {
	patientSchema,
	observationSchema,
	conditionSchema,
	bundleSchema,
	resourceValidators,
	searchValidators,
} from "./validators";

// ── Initialization ──────────────────────────────────────────────────────────

import { setAuditCollection } from "./audit";
import { isFhirConfigured } from "./config";
import { logger } from "$lib/server/logger";

/**
 * Initialize FHIR subsystem. Call once during server startup
 * (in hooks/init.ts) after database is ready.
 */
export async function initFhir(): Promise<void> {
	if (!isFhirConfigured()) {
		logger.info("FHIR backend not configured, skipping initialization");
		return;
	}

	// Wire up the audit collection (avoids circular import)
	const { collections } = await import("$lib/server/database");
	setAuditCollection(async () => collections.fhirAuditLogs);

	logger.info("FHIR backend initialized");
}
