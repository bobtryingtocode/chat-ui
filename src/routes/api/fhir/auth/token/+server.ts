import type { RequestHandler } from "@sveltejs/kit";
import { collections } from "$lib/server/database";
import { fhirJsonResponse, requireFhirAuth } from "$lib/server/fhir/middleware";

/**
 * GET /api/fhir/auth/token
 *
 * Returns the current FHIR OAuth token status (without exposing the token value).
 * Useful for clients to check if they need to re-authorize.
 */
export const GET: RequestHandler = async ({ locals }) => {
	const { sessionId } = requireFhirAuth(locals);

	const tokens = await collections.fhirOAuthTokens
		.find({ sessionId })
		.project({
			_id: 0,
			provider: 1,
			scopes: 1,
			expiresAt: 1,
			fhirServerUrl: 1,
			patientId: 1,
			createdAt: 1,
			updatedAt: 1,
		})
		.toArray();

	const result = tokens.map((t) => ({
		provider: t.provider,
		scopes: t.scopes,
		expiresAt: t.expiresAt,
		isExpired: new Date() > t.expiresAt,
		fhirServerUrl: t.fhirServerUrl,
		patientId: t.patientId,
	}));

	return fhirJsonResponse({ tokens: result });
};

/**
 * DELETE /api/fhir/auth/token
 *
 * Revokes all stored FHIR OAuth tokens for the current session.
 */
export const DELETE: RequestHandler = async ({ locals }) => {
	const { sessionId } = requireFhirAuth(locals);

	const result = await collections.fhirOAuthTokens.deleteMany({ sessionId });

	return fhirJsonResponse({
		revoked: result.deletedCount,
		message: `${result.deletedCount} FHIR token(s) revoked`,
	});
};
