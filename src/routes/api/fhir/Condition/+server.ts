import type { RequestHandler } from "@sveltejs/kit";
import {
	getFhirClient,
	fhirJsonResponse,
	auditFhirRequest,
	extractSearchParams,
	fhirError,
} from "$lib/server/fhir/middleware";
import { conditionSchema, conditionSearchSchema } from "$lib/server/fhir/validators";
import { FhirError } from "$lib/server/fhir/client";
import type { FhirCondition } from "$lib/types/FhirResource";

const SEARCH_PARAMS = [
	"_id",
	"patient",
	"subject",
	"category",
	"code",
	"clinical-status",
	"verification-status",
	"_count",
	"_offset",
];

/**
 * GET /api/fhir/Condition
 *
 * Search for Condition resources.
 */
export const GET: RequestHandler = async (event) => {
	const { client } = await getFhirClient(event);
	const searchParams = extractSearchParams(event.url, SEARCH_PARAMS);

	const parsed = conditionSearchSchema.safeParse(searchParams);
	if (!parsed.success) {
		fhirError(400, "invalid", `Invalid search parameters: ${parsed.error.message}`);
	}

	try {
		const result = await client.search<FhirCondition>("Condition", parsed.data);

		auditFhirRequest(event, {
			action: "search",
			resourceType: "Condition",
			outcome: "success",
			query: event.url.search,
		});

		return fhirJsonResponse(result.resource);
	} catch (err) {
		auditFhirRequest(event, {
			action: "search",
			resourceType: "Condition",
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
 * POST /api/fhir/Condition
 *
 * Create a new Condition resource.
 */
export const POST: RequestHandler = async (event) => {
	const { client } = await getFhirClient(event);

	let body: unknown;
	try {
		body = await event.request.json();
	} catch {
		fhirError(400, "invalid", "Request body must be valid JSON");
	}

	const parsed = conditionSchema.safeParse(body);
	if (!parsed.success) {
		fhirError(
			400,
			"structure",
			`Invalid Condition resource: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`
		);
	}

	try {
		const result = await client.create<FhirCondition>("Condition", parsed.data as FhirCondition);

		auditFhirRequest(event, {
			action: "create",
			resourceType: "Condition",
			resourceId: result.resource.id,
			outcome: "success",
		});

		return fhirJsonResponse(result.resource, 201);
	} catch (err) {
		auditFhirRequest(event, {
			action: "create",
			resourceType: "Condition",
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
