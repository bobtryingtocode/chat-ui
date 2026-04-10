import type { RequestHandler } from "@sveltejs/kit";
import { fhirConfig } from "$lib/server/fhir/config";
import { base } from "$app/paths";

/**
 * GET /api/fhir/well-known/smart-configuration
 *
 * SMART on FHIR Well-Known Configuration endpoint.
 * Required by the SMART App Launch Framework (https://hl7.org/fhir/smart-app-launch/).
 *
 * Note: The canonical path per SMART spec is /.well-known/smart-configuration
 * relative to the FHIR server root. Since this gateway proxies an upstream FHIR
 * server, this endpoint lives under /api/fhir/well-known/ (without the dot prefix
 * to avoid ESLint/bundler file-ignore rules). The CapabilityStatement advertises
 * the correct URLs for clients to discover.
 *
 * This endpoint MUST be publicly accessible (no auth required).
 */
export const GET: RequestHandler = async ({ url }) => {
	const origin = url.origin;

	const smartConfig = {
		authorization_endpoint: `${origin}${base}/api/fhir/auth/authorize`,
		token_endpoint: `${origin}${base}/api/fhir/auth/token`,
		token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
		capabilities: [
			"launch-standalone",
			"launch-ehr",
			"client-public",
			"client-confidential-symmetric",
			"context-standalone-patient",
			"context-ehr-patient",
			"sso-openid-connect",
			"permission-offline",
			"permission-patient",
			"permission-user",
		],
		scopes_supported: fhirConfig.smartScopes.split(" ").filter(Boolean),
		response_types_supported: ["code"],
		code_challenge_methods_supported: ["S256"],
		grant_types_supported: ["authorization_code", "refresh_token"],
		issuer: `${origin}${base}/api/fhir`,
	};

	return new Response(JSON.stringify(smartConfig), {
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "public, max-age=3600",
		},
	});
};
