import { z } from "zod";

/**
 * Zod validators for FHIR R4 resources.
 * These enforce structural correctness before forwarding to the FHIR server.
 */

// ── Primitives ──────────────────────────────────────────────────────────────

const fhirDateSchema = z.string().regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, "Invalid FHIR date");
const fhirDateTimeSchema = z
	.string()
	.regex(
		/^\d{4}(-\d{2}(-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?)?)?$/,
		"Invalid FHIR dateTime"
	);
const fhirInstantSchema = z
	.string()
	.regex(
		/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/,
		"Invalid FHIR instant"
	);

// ── Common Complex Types ────────────────────────────────────────────────────

const codingSchema = z
	.object({
		system: z.string().optional(),
		version: z.string().optional(),
		code: z.string().optional(),
		display: z.string().optional(),
		userSelected: z.boolean().optional(),
	})
	.passthrough();

const codeableConceptSchema = z
	.object({
		coding: z.array(codingSchema).optional(),
		text: z.string().optional(),
	})
	.passthrough();

const identifierSchema = z
	.object({
		use: z.enum(["usual", "official", "temp", "secondary", "old"]).optional(),
		type: codeableConceptSchema.optional(),
		system: z.string().optional(),
		value: z.string().optional(),
	})
	.passthrough();

const periodSchema = z
	.object({
		start: fhirDateTimeSchema.optional(),
		end: fhirDateTimeSchema.optional(),
	})
	.passthrough();

const referenceSchema = z
	.object({
		reference: z.string().optional(),
		type: z.string().optional(),
		display: z.string().optional(),
	})
	.passthrough();

const humanNameSchema = z
	.object({
		use: z.enum(["usual", "official", "temp", "nickname", "anonymous", "old", "maiden"]).optional(),
		text: z.string().optional(),
		family: z.string().optional(),
		given: z.array(z.string()).optional(),
		prefix: z.array(z.string()).optional(),
		suffix: z.array(z.string()).optional(),
		period: periodSchema.optional(),
	})
	.passthrough();

const contactPointSchema = z
	.object({
		system: z.enum(["phone", "fax", "email", "pager", "url", "sms", "other"]).optional(),
		value: z.string().optional(),
		use: z.enum(["home", "work", "temp", "old", "mobile"]).optional(),
		rank: z.number().int().positive().optional(),
		period: periodSchema.optional(),
	})
	.passthrough();

const addressSchema = z
	.object({
		use: z.enum(["home", "work", "temp", "old", "billing"]).optional(),
		type: z.enum(["postal", "physical", "both"]).optional(),
		text: z.string().optional(),
		line: z.array(z.string()).optional(),
		city: z.string().optional(),
		district: z.string().optional(),
		state: z.string().optional(),
		postalCode: z.string().optional(),
		country: z.string().optional(),
		period: periodSchema.optional(),
	})
	.passthrough();

const quantitySchema = z
	.object({
		value: z.number().optional(),
		comparator: z.enum(["<", "<=", ">=", ">"]).optional(),
		unit: z.string().optional(),
		system: z.string().optional(),
		code: z.string().optional(),
	})
	.passthrough();

const annotationSchema = z
	.object({
		authorReference: referenceSchema.optional(),
		authorString: z.string().optional(),
		time: fhirDateTimeSchema.optional(),
		text: z.string(),
	})
	.passthrough();

const metaSchema = z
	.object({
		versionId: z.string().optional(),
		lastUpdated: fhirInstantSchema.optional(),
		source: z.string().optional(),
		profile: z.array(z.string()).optional(),
		security: z.array(codingSchema).optional(),
		tag: z.array(codingSchema).optional(),
	})
	.passthrough();

// ── Patient ─────────────────────────────────────────────────────────────────

export const patientSchema = z
	.object({
		resourceType: z.literal("Patient"),
		id: z.string().optional(),
		meta: metaSchema.optional(),
		identifier: z.array(identifierSchema).optional(),
		active: z.boolean().optional(),
		name: z.array(humanNameSchema).optional(),
		telecom: z.array(contactPointSchema).optional(),
		gender: z.enum(["male", "female", "other", "unknown"]).optional(),
		birthDate: fhirDateSchema.optional(),
		deceasedBoolean: z.boolean().optional(),
		deceasedDateTime: fhirDateTimeSchema.optional(),
		address: z.array(addressSchema).optional(),
		maritalStatus: codeableConceptSchema.optional(),
		communication: z
			.array(
				z.object({
					language: codeableConceptSchema,
					preferred: z.boolean().optional(),
				})
			)
			.optional(),
		generalPractitioner: z.array(referenceSchema).optional(),
		managingOrganization: referenceSchema.optional(),
	})
	.passthrough();

// ── Observation ─────────────────────────────────────────────────────────────

export const observationSchema = z
	.object({
		resourceType: z.literal("Observation"),
		id: z.string().optional(),
		meta: metaSchema.optional(),
		identifier: z.array(identifierSchema).optional(),
		status: z.enum([
			"registered",
			"preliminary",
			"final",
			"amended",
			"corrected",
			"cancelled",
			"entered-in-error",
			"unknown",
		]),
		category: z.array(codeableConceptSchema).optional(),
		code: codeableConceptSchema,
		subject: referenceSchema.optional(),
		encounter: referenceSchema.optional(),
		effectiveDateTime: fhirDateTimeSchema.optional(),
		effectivePeriod: periodSchema.optional(),
		issued: fhirInstantSchema.optional(),
		performer: z.array(referenceSchema).optional(),
		valueQuantity: quantitySchema.optional(),
		valueCodeableConcept: codeableConceptSchema.optional(),
		valueString: z.string().optional(),
		valueBoolean: z.boolean().optional(),
		valueInteger: z.number().int().optional(),
		valueDateTime: fhirDateTimeSchema.optional(),
		valuePeriod: periodSchema.optional(),
		interpretation: z.array(codeableConceptSchema).optional(),
		note: z.array(annotationSchema).optional(),
		bodySite: codeableConceptSchema.optional(),
		method: codeableConceptSchema.optional(),
	})
	.passthrough();

// ── Condition ───────────────────────────────────────────────────────────────

export const conditionSchema = z
	.object({
		resourceType: z.literal("Condition"),
		id: z.string().optional(),
		meta: metaSchema.optional(),
		identifier: z.array(identifierSchema).optional(),
		clinicalStatus: codeableConceptSchema.optional(),
		verificationStatus: codeableConceptSchema.optional(),
		category: z.array(codeableConceptSchema).optional(),
		severity: codeableConceptSchema.optional(),
		code: codeableConceptSchema.optional(),
		bodySite: z.array(codeableConceptSchema).optional(),
		subject: referenceSchema,
		encounter: referenceSchema.optional(),
		onsetDateTime: fhirDateTimeSchema.optional(),
		onsetPeriod: periodSchema.optional(),
		onsetString: z.string().optional(),
		abatementDateTime: fhirDateTimeSchema.optional(),
		abatementPeriod: periodSchema.optional(),
		abatementString: z.string().optional(),
		recordedDate: fhirDateTimeSchema.optional(),
		recorder: referenceSchema.optional(),
		asserter: referenceSchema.optional(),
		note: z.array(annotationSchema).optional(),
	})
	.passthrough();

// ── Bundle ──────────────────────────────────────────────────────────────────

export const bundleEntrySchema = z
	.object({
		fullUrl: z.string().optional(),
		resource: z.record(z.unknown()).optional(),
		request: z
			.object({
				method: z.enum(["GET", "HEAD", "POST", "PUT", "DELETE", "PATCH"]),
				url: z.string(),
			})
			.optional(),
	})
	.passthrough();

export const bundleSchema = z
	.object({
		resourceType: z.literal("Bundle"),
		type: z.enum([
			"document",
			"message",
			"transaction",
			"transaction-response",
			"batch",
			"batch-response",
			"history",
			"searchset",
			"collection",
		]),
		entry: z.array(bundleEntrySchema).optional(),
	})
	.passthrough();

// ── Search params ───────────────────────────────────────────────────────────

export const patientSearchSchema = z.object({
	_id: z.string().optional(),
	identifier: z.string().optional(),
	family: z.string().optional(),
	given: z.string().optional(),
	name: z.string().optional(),
	gender: z.enum(["male", "female", "other", "unknown"]).optional(),
	birthdate: z.string().optional(),
	_count: z.coerce.number().int().positive().max(100).default(20),
	_offset: z.coerce.number().int().min(0).default(0),
});

export const observationSearchSchema = z.object({
	_id: z.string().optional(),
	patient: z.string().optional(),
	subject: z.string().optional(),
	category: z.string().optional(),
	code: z.string().optional(),
	date: z.string().optional(),
	status: z.string().optional(),
	_count: z.coerce.number().int().positive().max(100).default(20),
	_offset: z.coerce.number().int().min(0).default(0),
});

export const conditionSearchSchema = z.object({
	_id: z.string().optional(),
	patient: z.string().optional(),
	subject: z.string().optional(),
	category: z.string().optional(),
	code: z.string().optional(),
	"clinical-status": z.string().optional(),
	"verification-status": z.string().optional(),
	_count: z.coerce.number().int().positive().max(100).default(20),
	_offset: z.coerce.number().int().min(0).default(0),
});

// ── Validator lookup ────────────────────────────────────────────────────────

export const resourceValidators: Record<string, z.ZodTypeAny> = {
	Patient: patientSchema,
	Observation: observationSchema,
	Condition: conditionSchema,
	Bundle: bundleSchema,
};

export const searchValidators: Record<string, z.ZodTypeAny> = {
	Patient: patientSearchSchema,
	Observation: observationSearchSchema,
	Condition: conditionSearchSchema,
};
