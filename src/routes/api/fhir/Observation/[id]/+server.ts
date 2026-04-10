import type { RequestHandler } from "@sveltejs/kit";
import {
	getFhirClient,
	fhirJsonResponse,
	auditFhirRequest,
	fhirError,
} from "$lib/server/fhir/middleware";
import { observationSchema } from "$lib/server/fhir/validators";
import { FhirError } from "$lib/server/fhir/client";
import type { FhirObservation } from "$lib/types/FhirResource";

/**
 * GET /api/fhir/Observation/:id
 *
 * Read an Observation resource by ID.
 */
export const GET: RequestHandler = async (event) => {
	const { client } = await getFhirClient(event);
	const { id } = event.params;

	if (!id) {
		fhirError(400, "required", "Observation ID is required");
	}

	try {
		const result = await client.read<FhirObservation>("Observation", id);

		auditFhirRequest(event, {
			action: "read",
			resourceType: "Observation",
			resourceId: id,
			outcome: "success",
		});

		return fhirJsonResponse(result.resource);
	} catch (err) {
		auditFhirRequest(event, {
			action: "read",
			resourceType: "Observation",
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
 * PUT /api/fhir/Observation/:id
 *
 * Update an Observation resource.
 */
export const PUT: RequestHandler = async (event) => {
	const { client } = await getFhirClient(event);
	const { id } = event.params;

	if (!id) {
		fhirError(400, "required", "Observation ID is required");
	}

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

	const ifMatch = event.request.headers.get("If-Match") || undefined;

	try {
		const result = await client.update<FhirObservation>(
			"Observation",
			id,
			parsed.data as FhirObservation,
			ifMatch
		);

		auditFhirRequest(event, {
			action: "update",
			resourceType: "Observation",
			resourceId: id,
			outcome: "success",
		});

		return fhirJsonResponse(result.resource);
	} catch (err) {
		auditFhirRequest(event, {
			action: "update",
			resourceType: "Observation",
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
 * DELETE /api/fhir/Observation/:id
 *
 * Delete an Observation resource.
 */
export const DELETE: RequestHandler = async (event) => {
	const { client } = await getFhirClient(event);
	const { id } = event.params;

	if (!id) {
		fhirError(400, "required", "Observation ID is required");
	}

	try {
		const result = await client.delete("Observation", id);

		auditFhirRequest(event, {
			action: "delete",
			resourceType: "Observation",
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
						diagnostics: `Observation/${id} deleted`,
					},
				],
			}
		);
	} catch (err) {
		auditFhirRequest(event, {
			action: "delete",
			resourceType: "Observation",
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
