import type { RequestHandler } from "@sveltejs/kit";
import { fhirJsonResponse } from "$lib/server/fhir/middleware";
import { fhirConfig } from "$lib/server/fhir/config";
import type { FhirCapabilityStatement } from "$lib/types/FhirResource";
import { base } from "$app/paths";

/**
 * GET /api/fhir/metadata
 *
 * Returns the FHIR CapabilityStatement for this server.
 * This is the standard FHIR discovery endpoint that describes
 * server capabilities, supported resources, and security configuration.
 *
 * Per FHIR R4 spec, this endpoint MUST be publicly accessible (no auth required).
 */
export const GET: RequestHandler = async ({ url }) => {
	const origin = url.origin;

	const capabilityStatement: FhirCapabilityStatement = {
		resourceType: "CapabilityStatement",
		id: "chat-ui-fhir-gateway",
		url: `${origin}${base}/api/fhir/metadata`,
		version: "1.0.0",
		name: "ChatUIFhirGateway",
		title: "Chat UI FHIR Gateway",
		status: "active",
		experimental: false,
		date: new Date().toISOString().split("T")[0],
		publisher: "Chat UI",
		description:
			"FHIR R4 gateway providing access to healthcare data with SMART on FHIR and Google OAuth authorization. Compliant with HIPAA security requirements including audit logging, access controls, and TLS enforcement.",
		kind: "instance",
		fhirVersion: fhirConfig.fhirVersion,
		format: ["application/fhir+json", "application/json"],
		rest: [
			{
				mode: "server",
				documentation:
					"RESTful FHIR server with SMART on FHIR authorization. Supports Patient, Observation, and Condition resources with full CRUD operations.",
				security: {
					cors: true,
					service: [
						{
							coding: [
								{
									system: "http://terminology.hl7.org/CodeSystem/restful-security-service",
									code: "SMART-on-FHIR",
									display: "SMART on FHIR",
								},
							],
							text: "OAuth2 using SMART on FHIR profile (see http://docs.smarthealthit.org)",
						},
						{
							coding: [
								{
									system: "http://terminology.hl7.org/CodeSystem/restful-security-service",
									code: "OAuth",
									display: "OAuth",
								},
							],
							text: "Google OAuth 2.0 for Google Cloud Healthcare API",
						},
					],
					description:
						"This server supports SMART on FHIR and Google OAuth 2.0 authorization. All PHI access is logged per HIPAA requirements.",
					extension: [
						{
							url: "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris",
							extension: [
								{
									url: "authorize",
									valueUri: `${origin}${base}/api/fhir/auth/authorize`,
								},
								{
									url: "token",
									valueUri: `${origin}${base}/api/fhir/auth/token`,
								},
							],
						},
					],
				},
				resource: [
					{
						type: "Patient",
						profile: "http://hl7.org/fhir/StructureDefinition/Patient",
						interaction: [
							{ code: "read", documentation: "Read a Patient resource by ID" },
							{ code: "vread", documentation: "Read a specific version of a Patient" },
							{ code: "search-type", documentation: "Search for Patient resources" },
							{ code: "create", documentation: "Create a new Patient resource" },
							{ code: "update", documentation: "Update an existing Patient resource" },
							{ code: "delete", documentation: "Delete a Patient resource" },
							{ code: "history-instance", documentation: "Get history for a Patient" },
						],
						versioning: "versioned",
						readHistory: true,
						updateCreate: false,
						searchParam: [
							{ name: "_id", type: "token", documentation: "Resource ID" },
							{ name: "identifier", type: "token", documentation: "Patient identifier" },
							{ name: "family", type: "string", documentation: "Family name" },
							{ name: "given", type: "string", documentation: "Given name" },
							{ name: "name", type: "string", documentation: "Any part of the name" },
							{ name: "gender", type: "token", documentation: "Gender" },
							{ name: "birthdate", type: "date", documentation: "Date of birth" },
						],
					},
					{
						type: "Observation",
						profile: "http://hl7.org/fhir/StructureDefinition/Observation",
						interaction: [
							{ code: "read" },
							{ code: "vread" },
							{ code: "search-type" },
							{ code: "create" },
							{ code: "update" },
							{ code: "delete" },
							{ code: "history-instance" },
						],
						versioning: "versioned",
						readHistory: true,
						updateCreate: false,
						searchParam: [
							{ name: "_id", type: "token" },
							{ name: "patient", type: "reference", documentation: "Patient reference" },
							{ name: "subject", type: "reference" },
							{
								name: "category",
								type: "token",
								documentation: "Classification (e.g. vital-signs, laboratory)",
							},
							{
								name: "code",
								type: "token",
								documentation: "LOINC or other code for the observation",
							},
							{ name: "date", type: "date" },
							{ name: "status", type: "token" },
						],
					},
					{
						type: "Condition",
						profile: "http://hl7.org/fhir/StructureDefinition/Condition",
						interaction: [
							{ code: "read" },
							{ code: "vread" },
							{ code: "search-type" },
							{ code: "create" },
							{ code: "update" },
							{ code: "delete" },
							{ code: "history-instance" },
						],
						versioning: "versioned",
						readHistory: true,
						updateCreate: false,
						searchParam: [
							{ name: "_id", type: "token" },
							{ name: "patient", type: "reference" },
							{ name: "subject", type: "reference" },
							{ name: "category", type: "token" },
							{ name: "code", type: "token" },
							{ name: "clinical-status", type: "token" },
							{ name: "verification-status", type: "token" },
						],
					},
				],
			},
		],
	};

	return fhirJsonResponse(capabilityStatement);
};
