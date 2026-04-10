import { logger } from "$lib/server/logger";
import { fhirConfig } from "./config";
import type { FhirAuditLog, FhirAuditEvent } from "$lib/types/FhirResource";
import { ObjectId } from "mongodb";

/**
 * HIPAA-Compliant Audit Logging
 *
 * Implements audit logging per:
 * - HIPAA Security Rule §164.312(b) — Audit controls
 * - FHIR AuditEvent resource (https://hl7.org/fhir/R4/auditevent.html)
 * - NIST SP 800-92 — Guide to Computer Security Log Management
 *
 * Every access to PHI (Protected Health Information) is logged with:
 * - Who: User/session identifier
 * - What: Resource type and ID accessed
 * - When: Timestamp of the event
 * - Where: Source IP, user agent
 * - Why: Action type (CRUD)
 * - Outcome: Success or failure
 */

// Lazy collection accessor — avoids circular import with database.ts
let _getCollection: (() => Promise<import("mongodb").Collection<FhirAuditLog>>) | null = null;

export function setAuditCollection(
	getter: () => Promise<import("mongodb").Collection<FhirAuditLog>>
) {
	_getCollection = getter;
}

async function getCollection() {
	if (!_getCollection) {
		throw new Error("FHIR audit collection not initialized. Call setAuditCollection() first.");
	}
	return _getCollection();
}

// ── FHIR AuditEvent Type Codes ──────────────────────────────────────────────

const AUDIT_EVENT_TYPE = {
	system: "http://dicom.nema.org/resources/ontology/DCM",
	code: "110100",
	display: "Application Activity",
};

const AUDIT_SUBTYPE = {
	create: {
		system: "http://hl7.org/fhir/restful-interaction",
		code: "create",
		display: "create",
	},
	read: {
		system: "http://hl7.org/fhir/restful-interaction",
		code: "read",
		display: "read",
	},
	update: {
		system: "http://hl7.org/fhir/restful-interaction",
		code: "update",
		display: "update",
	},
	delete: {
		system: "http://hl7.org/fhir/restful-interaction",
		code: "delete",
		display: "delete",
	},
	search: {
		system: "http://hl7.org/fhir/restful-interaction",
		code: "search-type",
		display: "search",
	},
};

const ACTION_MAP: Record<string, "C" | "R" | "U" | "D" | "E"> = {
	create: "C",
	read: "R",
	update: "U",
	delete: "D",
	search: "E",
};

// ── Public API ──────────────────────────────────────────────────────────────

export interface AuditLogParams {
	action: "create" | "read" | "update" | "delete" | "search";
	resourceType: string;
	resourceId?: string;
	userId?: string;
	sessionId?: string;
	ip?: string;
	userAgent?: string;
	outcome: "success" | "failure";
	outcomeDescription?: string;
	query?: string;
}

/**
 * Record a HIPAA-compliant audit event for a FHIR operation.
 *
 * This function is intentionally fire-and-forget: audit logging must never
 * block or fail the primary request. Errors are logged but not thrown.
 */
export async function recordAuditEvent(params: AuditLogParams): Promise<void> {
	if (!fhirConfig.auditEnabled) return;

	try {
		const now = new Date();

		const fhirEvent: FhirAuditEvent = {
			resourceType: "AuditEvent",
			type: AUDIT_EVENT_TYPE,
			subtype: [AUDIT_SUBTYPE[params.action]],
			action: ACTION_MAP[params.action],
			recorded: now.toISOString(),
			outcome: params.outcome === "success" ? "0" : "8",
			outcomeDesc: params.outcomeDescription,
			agent: [
				{
					type: {
						coding: [
							{
								system: "http://terminology.hl7.org/CodeSystem/extra-security-role-type",
								code: "humanuser",
								display: "Human User",
							},
						],
					},
					who: params.userId
						? { reference: `Practitioner/${params.userId}`, display: params.userId }
						: { display: params.sessionId || "anonymous" },
					requestor: true,
					network: params.ip
						? {
								address: params.ip,
								type: "2", // IP address
							}
						: undefined,
				},
			],
			source: {
				site: "chat-ui-fhir",
				observer: { display: "chat-ui FHIR Gateway" },
				type: [
					{
						system: "http://terminology.hl7.org/CodeSystem/security-source-type",
						code: "4", // Application Server
						display: "Application Server",
					},
				],
			},
			entity: [
				{
					what: params.resourceId
						? {
								reference: `${params.resourceType}/${params.resourceId}`,
							}
						: undefined,
					type: {
						system: "http://terminology.hl7.org/CodeSystem/audit-entity-type",
						code: "2", // System Object
						display: "System Object",
					},
					role: {
						system: "http://terminology.hl7.org/CodeSystem/object-role",
						code: params.action === "search" ? "24" : "4", // Query vs Data
						display: params.action === "search" ? "Query" : "Domain Resource",
					},
					name: `${params.resourceType}${params.resourceId ? `/${params.resourceId}` : ""}`,
					query: params.query ? Buffer.from(params.query).toString("base64") : undefined,
				},
			],
		};

		const auditLog: FhirAuditLog = {
			_id: new ObjectId(),
			event: fhirEvent,
			userId: params.userId,
			sessionId: params.sessionId,
			resourceType: params.resourceType,
			resourceId: params.resourceId,
			action: params.action,
			outcome: params.outcome,
			ip: params.ip,
			userAgent: params.userAgent,
			createdAt: now,
			updatedAt: now,
		};

		const collection = await getCollection();
		await collection.insertOne(auditLog);
	} catch (err) {
		// Audit logging must never fail the primary request
		logger.error(err, "Failed to record FHIR audit event");
	}
}

/**
 * Query audit logs for compliance reporting.
 */
export async function queryAuditLogs(params: {
	userId?: string;
	resourceType?: string;
	resourceId?: string;
	action?: string;
	startDate?: Date;
	endDate?: Date;
	limit?: number;
	offset?: number;
}): Promise<{ logs: FhirAuditLog[]; total: number }> {
	const collection = await getCollection();

	const filter: Record<string, unknown> = {};
	if (params.userId) filter.userId = params.userId;
	if (params.resourceType) filter.resourceType = params.resourceType;
	if (params.resourceId) filter.resourceId = params.resourceId;
	if (params.action) filter.action = params.action;
	if (params.startDate || params.endDate) {
		filter.createdAt = {};
		if (params.startDate) (filter.createdAt as Record<string, Date>).$gte = params.startDate;
		if (params.endDate) (filter.createdAt as Record<string, Date>).$lte = params.endDate;
	}

	const [logs, total] = await Promise.all([
		collection
			.find(filter)
			.sort({ createdAt: -1 })
			.skip(params.offset || 0)
			.limit(params.limit || 50)
			.toArray(),
		collection.countDocuments(filter),
	]);

	return { logs, total };
}
