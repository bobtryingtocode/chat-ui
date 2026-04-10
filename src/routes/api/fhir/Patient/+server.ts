import type { RequestHandler } from "@sveltejs/kit";
import {
	getFhirClient,
	fhirJsonResponse,
	auditFhirRequest,
	extractSearchParams,
	fhirError,
} from "$lib/server/fhir/middleware";
import { patientSchema, patientSearchSchema } from "$lib/server/fhir/validators";
import { FhirError } from "$lib/server/fhir/client";
import type { FhirPatient } from "$lib/types/FhirResource";

const SEARCH_PARAMS = [
	"_id",
	"identifier",
	"family",
	"given",
	"name",
	"gender",
	"birthdate",
	"_count",
	"_offset",
];

/**
 * GET /api/fhir/Patient
 *
 * Search for Patient resources.
 * Supports standard FHIR search parameters.
 */
export const GET: RequestHandler = async (event) => {
	const { client } = await getFhirClient(event);
	const searchParams = extractSearchParams(event.url, SEARCH_PARAMS);

	const parsed = patientSearchSchema.safeParse(searchParams);
	if (!parsed.success) {
		fhirError(400, "invalid", `Invalid search parameters: ${parsed.error.message}`);
	}

	try {
		const result = await client.search<FhirPatient>("Patient", parsed.data);

		auditFhirRequest(event, {
			action: "search",
			resourceType: "Patient",
			outcome: "success",
			query: event.url.search,
		});

		return fhirJsonResponse(result.resource);
	} catch (err) {
		auditFhirRequest(event, {
			action: "search",
			resourceType: "Patient",
			outcome: "failure",
			outcomeDescription: err instanceof Error ? err.message : "Unknown error",
		});

		if (err instanceof FhirError) {
			return fhirJsonResponse(
				err.operationOutcome || {
					resourceType: "OperationOutcome",
					issue: [{ severity: "error", code: "exception", diagnostics: err.message }],
				},
				err.status
			);
		}
		throw err;
	}
};

/**
 * POST /api/fhir/Patient
 *
 * Create a new Patient resource.
 */
export const POST: RequestHandler = async (event) => {
	const { client } = await getFhirClient(event);

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		fhirError(400, "invalid", "Request body must be valid JSON");
	}

	const parsed = patientSchema.safeParse(body);
	if (!parsed.success) {
		fhirError(
			400,
			"structure",
			`Invalid Patient resource: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
		);
	}

	try {
		const result = await client.create<FhirPatient>("Patient", parsed.data as FhirPatient);

		auditFhirRequest(event, {
			action: "create",
			resourceType: "Patient",
			resourceId: result.resource.id,
			outcome: "success",
		});

		return fhirJsonResponse(result.resource, 201);
	} catch (err) {
		auditFhirRequest(event, {
			action: "create",
			resourceType: "Patient",
			outcome: "failure",
			outcomeDescription: err instanceof Error ? err.message : "Unknown error",
		});

		if (err instanceof FhirError) {
			return fhirJsonResponse(
				err.operationOutcome || {
					resourceType: "OperationOutcome",
					issue: [{ severity: "error", code: "exception", diagnostics: err.message }],
				},
				err.status
			);
		}
		throw err;
	}
};
