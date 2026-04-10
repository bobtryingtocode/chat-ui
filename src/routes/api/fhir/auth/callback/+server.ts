import { redirect, type RequestHandler } from "@sveltejs/kit";
import { collections } from "$lib/server/database";
import { fhirError } from "$lib/server/fhir/middleware";
import {
	decodeOAuthState,
	exchangeGoogleCode,
	exchangeSmartCode,
	getGoogleUserInfo,
} from "$lib/server/fhir/oauth";
import { recordAuditEvent } from "$lib/server/fhir/audit";
import { logger } from "$lib/server/logger";
import { ObjectId } from "mongodb";
import { base } from "$app/paths";

/**
 * GET /api/fhir/auth/callback
 *
 * OAuth callback handler for both Google and SMART on FHIR flows.
 * Exchanges the authorization code for tokens and stores them.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	const code = url.searchParams.get("code");
	const stateParam = url.searchParams.get("state");
	const errorParam = url.searchParams.get("error");

	if (errorParam) {
		const errorDesc = url.searchParams.get("error_description") || errorParam;
		logger.warn({ error: errorParam, description: errorDesc }, "FHIR OAuth error callback");
		fhirError(401, "login", `OAuth authorization failed: ${errorDesc}`);
	}

	if (!code || !stateParam) {
		fhirError(400, "required", "Missing code or state parameter in OAuth callback");
	}

	const state = await decodeOAuthState(stateParam);
	if (!state) {
		fhirError(400, "security", "Invalid or expired OAuth state parameter");
	}

	// Verify session matches
	if (state.sessionId !== locals.sessionId) {
		fhirError(403, "security", "OAuth state session mismatch");
	}

	try {
		if (state.provider === "google") {
			const tokenResponse = await exchangeGoogleCode(code, state.redirectUri, state.codeVerifier);

			// Get user info for auditing
			let googleUserId: string | undefined;
			try {
				const userInfo = await getGoogleUserInfo(tokenResponse.access_token);
				googleUserId = userInfo.sub;
			} catch {
				// Non-fatal: user info is for audit enrichment only
			}

			const now = new Date();
			await collections.fhirOAuthTokens.updateOne(
				{
					sessionId: locals.sessionId,
					provider: "google",
				},
				{
					$set: {
						userId: locals.user?._id?.toString() || locals.sessionId,
						accessToken: tokenResponse.access_token,
						refreshToken: tokenResponse.refresh_token,
						expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
						scopes: (tokenResponse.scope || "").split(" ").filter(Boolean),
						updatedAt: now,
					},
					$setOnInsert: {
						_id: new ObjectId(),
						createdAt: now,
					},
				},
				{ upsert: true }
			);

			// Audit the successful authentication
			await recordAuditEvent({
				action: "read",
				resourceType: "OAuthToken",
				resourceId: googleUserId,
				userId: locals.user?._id?.toString(),
				sessionId: locals.sessionId,
				outcome: "success",
				outcomeDescription: "Google OAuth authorization completed",
			});
		} else if (state.provider === "smart-on-fhir") {
			if (!state.fhirServerUrl) {
				fhirError(400, "required", "FHIR server URL missing from SMART state");
			}

			const tokenResponse = await exchangeSmartCode({
				code,
				fhirServerUrl: state.fhirServerUrl,
				redirectUri: state.redirectUri,
				codeVerifier: state.codeVerifier,
			});

			const now = new Date();
			await collections.fhirOAuthTokens.updateOne(
				{
					sessionId: locals.sessionId,
					provider: "smart-on-fhir",
				},
				{
					$set: {
						userId: locals.user?._id?.toString() || locals.sessionId,
						accessToken: tokenResponse.access_token,
						refreshToken: tokenResponse.refresh_token,
						expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
						scopes: (tokenResponse.scope || "").split(" ").filter(Boolean),
						fhirServerUrl: state.fhirServerUrl,
						patientId: tokenResponse.patient,
						updatedAt: now,
					},
					$setOnInsert: {
						_id: new ObjectId(),
						createdAt: now,
					},
				},
				{ upsert: true }
			);

			await recordAuditEvent({
				action: "read",
				resourceType: "OAuthToken",
				userId: locals.user?._id?.toString(),
				sessionId: locals.sessionId,
				outcome: "success",
				outcomeDescription: `SMART on FHIR authorization completed for ${state.fhirServerUrl}`,
			});
		}

		// Redirect to the next page or default
		const next = state.next || `${base}/`;
		throw redirect(302, next);
	} catch (err) {
		// Re-throw redirects
		if (
			err instanceof Response ||
			(err &&
				typeof err === "object" &&
				"status" in err &&
				(err as { status: number }).status === 302)
		) {
			throw err;
		}

		logger.error(err, "FHIR OAuth callback error");

		await recordAuditEvent({
			action: "read",
			resourceType: "OAuthToken",
			userId: locals.user?._id?.toString(),
			sessionId: locals.sessionId,
			outcome: "failure",
			outcomeDescription: `OAuth token exchange failed: ${err instanceof Error ? err.message : "unknown"}`,
		});

		fhirError(500, "exception", "OAuth token exchange failed. Please try again.");
	}
};
