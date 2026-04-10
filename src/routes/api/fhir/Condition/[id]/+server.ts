import type { RequestHandler } from "@sveltejs/kit";
import {
	getFhirClient,
	fhirJsonResponse,
	auditFhirRequest,
	fhirError,
} from "$lib/server/fhir/middleware";
import { conditionSchema } from "$lib/server/fhir/validators";
import { FhirError } from "$lib/server/fhir/client";
import type { FhirCondition } from "$lib/types/FhirResource";

/**
 * GET /api/fhir/Condition/:id
 *
 * Read a Condition resource by ID.
 */
export const GET: RequestHandler = async (event) => {
	const { client } = await getFhirClient(event);
	const { id } = event.params;

	if (!id) {
		fhirError(400, "required", "Condition ID is required");
	}

	try {
		const result = await client.read<FhirCondition>("Condition", id);

		auditFhirRequest(event, {
			action: "read",
			resourceType: "Condition",
			resourceId: id,
			outcome: "success",
		});

		return fhirJsonResponse(result.resource);
	} catch (err) {
		auditFhirRequest(event, {
			action: "read",
			resourceType: "Condition",
			resourceId: id,
			outcome: "failure",
			outcomeDescription: err instanceof Error ? err.message : "Unknown error",
		});

		if (err instanceof FhirError) {
			return fhirJsonResponse(
				err.operationOutcome || {
					resourceType: "OperationOutcome",
					issue: [{ severity: "error", code: "not-found", diagnostics: err.message }],
				},
				err.status
			);
		}
		throw err;
	}
};

/**
 * PUT /api/fhir/Condition/:id
 *
 * Update a Condition resource.
 */
export const PUT: RequestHandler = async (event) => {
	const { client } = await getFhirClient(event);
	const { id } = event.params;

	if (!id) {
		fhirError(400, "required", "Condition ID is required");
	}

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

	const ifMatch = event.request.headers.get("If-Match") || undefined;

	try {
		const result = await client.update<FhirCondition>(
			"Condition",
			id,
			parsed.data as FhirCondition,
			ifMatch
		);

		auditFhirRequest(event, {
			action: "update",
			resourceType: "Condition",
			resourceId: id,
			outcome: "success",
		});

		return fhirJsonResponse(result.resource);
	} catch (err) {
		auditFhirRequest(event, {
			action: "update",
			resourceType: "Condition",
			resourceId: id,
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
 * DELETE /api/fhir/Condition/:id
 *
 * Delete a Condition resource.
 */
export const DELETE: RequestHandler = async (event) => {
	const { client } = await getFhirClient(event);
	const { id } = event.params;

	if (!id) {
		fhirError(400, "required", "Condition ID is required");
	}

	try {
		const result = await client.delete("Condition", id);

		auditFhirRequest(event, {
			action: "delete",
			resourceType: "Condition",
			resourceId: id,
			outcome: "success",
		});

		return fhirJsonResponse(
			result.resource || {
				resourceType: "OperationOutcome",
				issue: [
					{
						severity: "information",
						code: "deleted",
						diagnostics: `Condition/${id} deleted`,
					},
				],
			}
		);
	} catch (err) {
		auditFhirRequest(event, {
			action: "delete",
			resourceType: "Condition",
			resourceId: id,
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
