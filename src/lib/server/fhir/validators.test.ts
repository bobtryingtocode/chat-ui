import { describe, it, expect } from "vitest";
import {
	patientSchema,
	observationSchema,
	conditionSchema,
	patientSearchSchema,
	observationSearchSchema,
	conditionSearchSchema,
} from "./validators";

describe("patientSchema", () => {
	it("should accept a valid minimal Patient", () => {
		const result = patientSchema.safeParse({
			resourceType: "Patient",
		});
		expect(result.success).toBe(true);
	});

	it("should accept a full Patient resource", () => {
		const result = patientSchema.safeParse({
			resourceType: "Patient",
			id: "example",
			meta: { versionId: "1" },
			identifier: [
				{
					use: "official",
					system: "http://hl7.org/fhir/sid/us-ssn",
					value: "123-45-6789",
				},
			],
			active: true,
			name: [
				{
					use: "official",
					family: "Doe",
					given: ["John"],
				},
			],
			telecom: [{ system: "phone", value: "555-0100", use: "home" }],
			gender: "male",
			birthDate: "1990-01-15",
			address: [
				{
					use: "home",
					line: ["123 Main St"],
					city: "Springfield",
					state: "IL",
					postalCode: "62701",
					country: "US",
				},
			],
		});
		expect(result.success).toBe(true);
	});

	it("should reject wrong resourceType", () => {
		const result = patientSchema.safeParse({
			resourceType: "Observation",
		});
		expect(result.success).toBe(false);
	});

	it("should reject invalid gender", () => {
		const result = patientSchema.safeParse({
			resourceType: "Patient",
			gender: "invalid",
		});
		expect(result.success).toBe(false);
	});

	it("should reject invalid birthDate format", () => {
		const result = patientSchema.safeParse({
			resourceType: "Patient",
			birthDate: "15-01-1990",
		});
		expect(result.success).toBe(false);
	});

	it("should accept birthDate with only year", () => {
		const result = patientSchema.safeParse({
			resourceType: "Patient",
			birthDate: "1990",
		});
		expect(result.success).toBe(true);
	});

	it("should allow additional FHIR properties via passthrough", () => {
		const result = patientSchema.safeParse({
			resourceType: "Patient",
			extension: [{ url: "http://example.com/ext", valueString: "test" }],
		});
		expect(result.success).toBe(true);
	});
});

describe("observationSchema", () => {
	it("should accept a valid Observation", () => {
		const result = observationSchema.safeParse({
			resourceType: "Observation",
			status: "final",
			code: {
				coding: [{ system: "http://loinc.org", code: "8867-4", display: "Heart rate" }],
			},
			subject: { reference: "Patient/123" },
			valueQuantity: {
				value: 72,
				unit: "beats/minute",
				system: "http://unitsofmeasure.org",
				code: "/min",
			},
		});
		expect(result.success).toBe(true);
	});

	it("should require status", () => {
		const result = observationSchema.safeParse({
			resourceType: "Observation",
			code: { text: "test" },
		});
		expect(result.success).toBe(false);
	});

	it("should require code", () => {
		const result = observationSchema.safeParse({
			resourceType: "Observation",
			status: "final",
		});
		expect(result.success).toBe(false);
	});

	it("should reject invalid status", () => {
		const result = observationSchema.safeParse({
			resourceType: "Observation",
			status: "invalid",
			code: { text: "test" },
		});
		expect(result.success).toBe(false);
	});
});

describe("conditionSchema", () => {
	it("should accept a valid Condition", () => {
		const result = conditionSchema.safeParse({
			resourceType: "Condition",
			subject: { reference: "Patient/123" },
			clinicalStatus: {
				coding: [
					{
						system: "http://terminology.hl7.org/CodeSystem/condition-clinical",
						code: "active",
					},
				],
			},
			code: {
				coding: [{ system: "http://snomed.info/sct", code: "44054006", display: "Diabetes" }],
			},
			onsetDateTime: "2020-06-15",
		});
		expect(result.success).toBe(true);
	});

	it("should require subject", () => {
		const result = conditionSchema.safeParse({
			resourceType: "Condition",
		});
		expect(result.success).toBe(false);
	});
});

describe("patientSearchSchema", () => {
	it("should parse valid search params", () => {
		const result = patientSearchSchema.safeParse({
			family: "Smith",
			gender: "female",
			_count: "10",
		});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data._count).toBe(10);
			expect(result.data.family).toBe("Smith");
		}
	});

	it("should default _count to 20", () => {
		const result = patientSearchSchema.safeParse({});
		expect(result.success).toBe(true);
		if (result.success) {
			expect(result.data._count).toBe(20);
		}
	});

	it("should cap _count at 100", () => {
		const result = patientSearchSchema.safeParse({ _count: "200" });
		expect(result.success).toBe(false);
	});
});

describe("observationSearchSchema", () => {
	it("should parse observation search params", () => {
		const result = observationSearchSchema.safeParse({
			patient: "Patient/123",
			code: "http://loinc.org|8867-4",
			_count: "50",
		});
		expect(result.success).toBe(true);
	});
});

describe("conditionSearchSchema", () => {
	it("should parse condition search params with clinical-status", () => {
		const result = conditionSearchSchema.safeParse({
			patient: "Patient/123",
			"clinical-status": "active",
		});
		expect(result.success).toBe(true);
	});
});
