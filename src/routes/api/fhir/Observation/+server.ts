import type { RequestHandler } from "@sveltejs/kit";
import {
	getFhirClient,
	fhirJsonResponse,
	auditFhirRequest,
	extractSearchParams,
	fhirError,
} from "$lib/server/fhir/middleware";
import { observationSchema, observationSearchSchema } from "$lib/server/fhir/validators";
import { FhirError } from "$lib/server/fhir/client";
import type { FhirObservation } from "$lib/types/FhirResource";

const SEARCH_PARAMS = [
	"_id",
	"patient",
	"subject",
	"category",
	"code",
	"date",
	"status",
	"_count",
	"_offset",
];

/**
 * GET /api/fhir/Observation
 *
 * Search for Observation resources.
 */
export const GET: RequestHandler = async (event) => {
	const { client } = await getFhirClient(event);
	const searchParams = extractSearchParams(event.url, SEARCH_PARAMS);

	const parsed = observationSearchSchema.safeParse(searchParams);
	if (!parsed.success) {
		fhirError(400, "invalid", `Invalid search parameters: ${parsed.error.message}`);
	}

	try {
		const result = await client.search<FhirObservation>("Observation", parsed.data);

		auditFhirRequest(event, {
			action: "search",
			resourceType: "Observation",
			outcome: "success",
			query: event.url.search,
		});

		return fhirJsonResponse(result.resource);
	} catch (err) {
		auditFhirRequest(event, {
			action: "search",
			resourceType: "Observation",
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
 * POST /api/fhir/Observation
 *
 * Create a new Observation resource.
 */
export const POST: RequestHandler = async (event) => {
	const { client } = await getFhirClient(event);

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		fhirError(400, "invalid", "Request body must be valid JSON");
	}

	const parsed = observationSchema.safeParse(body);
	if (!parsed.success) {
		fhirError(
			400,
			"structure",
			`Invalid Observation resource: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
		);
	}

	try {
		const result = await client.create<FhirObservation>(
			"Observation",
			parsed.data as FhirObservation
		);

		auditFhirRequest(event, {
			action: "create",
			resourceType: "Observation",
			resourceId: result.resource.id,
			outcome: "success",
		});

		return fhirJsonResponse(result.resource, 201);
	} catch (err) {
		auditFhirRequest(event, {
			action: "create",
			resourceType: "Observation",
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
