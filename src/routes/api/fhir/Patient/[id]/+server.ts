import type { RequestHandler } from "@sveltejs/kit";
import {
	getFhirClient,
	fhirJsonResponse,
	auditFhirRequest,
	fhirError,
} from "$lib/server/fhir/middleware";
import { patientSchema } from "$lib/server/fhir/validators";
import { FhirError } from "$lib/server/fhir/client";
import type { FhirPatient } from "$lib/types/FhirResource";

/**
 * GET /api/fhir/Patient/:id
 *
 * Read a Patient resource by ID.
 */
export const GET: RequestHandler = async (event) => {
	const { client } = await getFhirClient(event);
	const { id } = event.params;

	if (!id) {
		fhirError(400, "required", "Patient ID is required");
	}

	try {
		const result = await client.read<FhirPatient>("Patient", id);

		auditFhirRequest(event, {
			action: "read",
			resourceType: "Patient",
			resourceId: id,
			outcome: "success",
		});

		return fhirJsonResponse(result.resource);
	} catch (err) {
		auditFhirRequest(event, {
			action: "read",
			resourceType: "Patient",
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
 * PUT /api/fhir/Patient/:id
 *
 * Update a Patient resource.
 */
export const PUT: RequestHandler = async (event) => {
	const { client } = await getFhirClient(event);
	const { id } = event.params;

	if (!id) {
		fhirError(400, "required", "Patient ID is required");
	}

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

	const ifMatch = event.request.headers.get("If-Match") || undefined;

	try {
		const result = await client.update<FhirPatient>(
			"Patient",
			id,
			parsed.data as FhirPatient,
			ifMatch
		);

		auditFhirRequest(event, {
			action: "update",
			resourceType: "Patient",
			resourceId: id,
			outcome: "success",
		});

		return fhirJsonResponse(result.resource);
	} catch (err) {
		auditFhirRequest(event, {
			action: "update",
			resourceType: "Patient",
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
 * DELETE /api/fhir/Patient/:id
 *
 * Delete a Patient resource.
 */
export const DELETE: RequestHandler = async (event) => {
	const { client } = await getFhirClient(event);
	const { id } = event.params;

	if (!id) {
		fhirError(400, "required", "Patient ID is required");
	}

	try {
		const result = await client.delete("Patient", id);

		auditFhirRequest(event, {
			action: "delete",
			resourceType: "Patient",
			resourceId: id,
			outcome: "success",
		});

		return fhirJsonResponse(
			result.resource || {
				resourceType: "OperationOutcome",
				issue: [{ severity: "information", code: "deleted", diagnostics: `Patient/${id} deleted` }],
			}
		);
	} catch (err) {
		auditFhirRequest(event, {
			action: "delete",
			resourceType: "Patient",
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
