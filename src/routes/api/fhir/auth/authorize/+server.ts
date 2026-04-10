import { redirect, type RequestHandler } from "@sveltejs/kit";
import { requireFhirAuth, requireFhirConfigured, fhirError } from "$lib/server/fhir/middleware";
import { getGoogleAuthorizationUrl, getSmartAuthorizationUrl } from "$lib/server/fhir/oauth";

/**
 * GET /api/fhir/auth/authorize
 *
 * Initiates the FHIR OAuth authorization flow.
 *
 * Query params:
 *   provider  — "google" (default) or "smart-on-fhir"
 *   fhir_url  — Required for SMART on FHIR: the FHIR server base URL
 *   launch    — Optional SMART launch context token
 *   next      — Optional return path after auth completes
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	requireFhirConfigured();
	const { sessionId } = requireFhirAuth(locals);

	const provider = url.searchParams.get("provider") || "google";
	const next = url.searchParams.get("next") || undefined;
	const origin = url.origin;

	if (provider === "google") {
		const { url: authUrl } = await getGoogleAuthorizationUrl({
			sessionId,
			next,
			origin,
		});
		throw redirect(302, authUrl);
	}

	if (provider === "smart-on-fhir") {
		const fhirServerUrl = url.searchParams.get("fhir_url");
		if (!fhirServerUrl) {
			fhirError(400, "required", "fhir_url query parameter is required for SMART on FHIR");
		}

		const launch = url.searchParams.get("launch") || undefined;

		const { url: authUrl } = await getSmartAuthorizationUrl({
			fhirServerUrl,
			sessionId,
			origin,
			next,
			launch,
		});
		throw redirect(302, authUrl);
	}

	fhirError(
		400,
		"invalid",
		`Unsupported OAuth provider: ${provider}. Use "google" or "smart-on-fhir".`
	);
};
