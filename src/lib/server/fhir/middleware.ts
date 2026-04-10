import { error, type RequestEvent } from "@sveltejs/kit";
import { collections } from "$lib/server/database";
import { fhirConfig, isFhirConfigured } from "./config";
import { createFhirClient, type FhirClient } from "./client";
import { recordAuditEvent, type AuditLogParams } from "./audit";
import { resolveAccessToken } from "./oauth";
import { logger } from "$lib/server/logger";
import type { FhirOperationOutcome } from "$lib/types/FhirResource";

/**
 * FHIR Middleware
 *
 * Provides request-level utilities for FHIR API routes:
 * - Authentication and authorization enforcement
 * - FHIR client instantiation with valid tokens
 * - Rate limiting
 * - Audit logging helpers
 * - FHIR-compliant error responses (OperationOutcome)
 */

// ── Rate Limiting ───────────────────────────────────────────────────────────

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(sessionId: string): void {
	if (!fhirConfig.rateLimitEnabled) return;

	const now = Date.now();
	const bucket = rateLimitBuckets.get(sessionId);

	if (!bucket || bucket.resetAt < now) {
		rateLimitBuckets.set(sessionId, { count: 1, resetAt: now + 60_000 });
		return;
	}

	bucket.count++;
	if (bucket.count > fhirConfig.rateLimitPerMinute) {
		throw fhirError(429, "rate-limited", "Too many FHIR requests. Please try again later.");
	}
}

// Periodic cleanup of stale buckets
setInterval(() => {
	const now = Date.now();
	for (const [key, bucket] of rateLimitBuckets) {
		if (bucket.resetAt < now) {
			rateLimitBuckets.delete(key);
		}
	}
}, 60_000);

// ── FHIR Error Response ────────────────────────────────────────────────────

export function fhirError(status: number, code: string, diagnostics: string): never {
	const outcome: FhirOperationOutcome = {
		resourceType: "OperationOutcome",
		issue: [
			{
				severity: status >= 500 ? "fatal" : "error",
				code,
				diagnostics,
			},
		],
	};

	error(status, JSON.stringify(outcome));
}

export function fhirJsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"Content-Type": "application/fhir+json",
			"X-Content-Type-Options": "nosniff",
			"Cache-Control": "no-store",
			Pragma: "no-cache",
		},
	});
}

// ── Auth Enforcement ────────────────────────────────────────────────────────

export function requireFhirAuth(locals: App.Locals): {
	userId: string | undefined;
	sessionId: string;
} {
	if (!locals.sessionId) {
		fhirError(401, "login", "Authentication required for FHIR access");
	}

	return {
		userId: locals.user?._id?.toString(),
		sessionId: locals.sessionId,
	};
}

export function requireFhirConfigured(): void {
	if (!isFhirConfigured()) {
		fhirError(
			503,
			"not-supported",
			"FHIR backend is not configured. Set FHIR_SERVER_URL or Google Healthcare API credentials."
		);
	}
}

// ── FHIR Client Factory ────────────────────────────────────────────────────

export async function getFhirClient(event: RequestEvent): Promise<{
	client: FhirClient;
	userId: string | undefined;
	sessionId: string;
}> {
	requireFhirConfigured();
	const { userId, sessionId } = requireFhirAuth(event.locals);

	checkRateLimit(sessionId);

	const accessToken = await resolveAccessToken({
		userId,
		sessionId,
		getFhirToken: async () => {
			const token = await collections.fhirOAuthTokens.findOne({
				sessionId,
			});
			if (!token) return undefined;
			return {
				accessToken: token.accessToken,
				refreshToken: token.refreshToken,
				expiresAt: token.expiresAt,
				provider: token.provider,
				fhirServerUrl: token.fhirServerUrl,
			};
		},
		updateFhirToken: async (newToken) => {
			await collections.fhirOAuthTokens.updateOne(
				{ sessionId },
				{
					$set: {
						accessToken: newToken.accessToken,
						refreshToken: newToken.refreshToken,
						expiresAt: newToken.expiresAt,
						updatedAt: new Date(),
					},
				}
			);
		},
	});

	const client = createFhirClient({ accessToken });

	return { client, userId, sessionId };
}

// ── Audit Helper ────────────────────────────────────────────────────────────

export function auditFhirRequest(
	event: RequestEvent,
	params: Omit<AuditLogParams, "ip" | "userAgent" | "userId" | "sessionId">
): void {
	const ip =
		event.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || event.getClientAddress();
	const userAgent = event.request.headers.get("user-agent") || undefined;

	// Fire-and-forget
	recordAuditEvent({
		...params,
		userId: event.locals.user?._id?.toString(),
		sessionId: event.locals.sessionId,
		ip,
		userAgent,
	}).catch((err) => logger.error(err, "Audit logging failed"));
}

// ── Consent Check ───────────────────────────────────────────────────────────

export async function checkPatientConsent(userId: string, patientId: string): Promise<boolean> {
	if (!fhirConfig.consentEnabled) return true;

	const consent = await collections.fhirConsents.findOne({
		userId,
		patientId,
		status: "active",
		$or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }],
	});

	return !!consent;
}

// ── Search Param Extraction ─────────────────────────────────────────────────

export function extractSearchParams(
	url: URL,
	allowedParams: string[]
): Record<string, string | undefined> {
	const params: Record<string, string | undefined> = {};
	for (const key of allowedParams) {
		const value = url.searchParams.get(key);
		if (value !== null) {
			params[key] = value;
		}
	}
	return params;
}
