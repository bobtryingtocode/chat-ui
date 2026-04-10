import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock transitive dependencies before importing the module under test
vi.mock("$lib/server/config", () => ({
	config: {},
}));

vi.mock("$lib/server/logger", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("./config", () => ({
	fhirConfig: {
		requireTls: true,
		fhirVersion: "4.0.1",
	},
	getFhirBaseUrl: () =>
		"https://healthcare.googleapis.com/v1/projects/test/locations/us/datasets/test/fhirStores/test/fhir",
}));

import { createFhirClient, FhirError } from "./client";

describe("FhirError", () => {
	it("should store status and operationOutcome", () => {
		const outcome = {
			resourceType: "OperationOutcome" as const,
			issue: [{ severity: "error" as const, code: "not-found", diagnostics: "Not found" }],
		};
		const error = new FhirError("test", 404, outcome);
		expect(error.status).toBe(404);
		expect(error.operationOutcome).toEqual(outcome);
		expect(error.name).toBe("FhirError");
		expect(error.message).toBe("test");
	});
});

describe("createFhirClient", () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);
	});

	it("should reject non-TLS URLs when requireTls is true", () => {
		expect(() =>
			createFhirClient({
				baseUrl: "http://insecure-server.com/fhir",
				accessToken: "test-token",
			})
		).toThrow("FHIR connection requires TLS");
	});

	it("should create a client with TLS URL", () => {
		const client = createFhirClient({
			baseUrl: "https://secure-server.com/fhir",
			accessToken: "test-token",
		});
		expect(client).toBeDefined();
		expect(client.read).toBeDefined();
		expect(client.search).toBeDefined();
		expect(client.create).toBeDefined();
		expect(client.update).toBeDefined();
		expect(client.delete).toBeDefined();
		expect(client.history).toBeDefined();
		expect(client.transaction).toBeDefined();
		expect(client.capabilities).toBeDefined();
	});

	it("should send correct headers for read", async () => {
		const patient = { resourceType: "Patient", id: "123", name: [{ family: "Test" }] };
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify(patient), {
				status: 200,
				headers: { "Content-Type": "application/fhir+json" },
			})
		);

		const client = createFhirClient({
			baseUrl: "https://test.com/fhir",
			accessToken: "my-token",
		});

		const result = await client.read("Patient", "123");

		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("https://test.com/fhir/Patient/123");
		expect(init.method).toBe("GET");
		expect(init.headers.Authorization).toBe("Bearer my-token");
		expect(init.headers.Accept).toBe("application/fhir+json");
		expect(result.resource).toEqual(patient);
	});

	it("should build correct search URL with params", async () => {
		const bundle = { resourceType: "Bundle", type: "searchset", total: 0, entry: [] };
		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(bundle), { status: 200 }));

		const client = createFhirClient({
			baseUrl: "https://test.com/fhir",
			accessToken: "my-token",
		});

		await client.search("Patient", { family: "Smith", _count: 10 });

		const [url] = fetchMock.mock.calls[0];
		const parsedUrl = new URL(url);
		expect(parsedUrl.pathname).toBe("/fhir/Patient");
		expect(parsedUrl.searchParams.get("family")).toBe("Smith");
		expect(parsedUrl.searchParams.get("_count")).toBe("10");
	});

	it("should throw FhirError on non-OK response", async () => {
		const outcome = {
			resourceType: "OperationOutcome",
			issue: [{ severity: "error", code: "not-found", diagnostics: "Patient/999 not found" }],
		};
		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(outcome), { status: 404 }));

		const client = createFhirClient({
			baseUrl: "https://test.com/fhir",
			accessToken: "my-token",
		});

		await expect(client.read("Patient", "999")).rejects.toThrow(FhirError);
		try {
			await client.read("Patient", "999");
		} catch (err) {
			// Second call also fails (fresh mock needed), skip
		}
	});

	it("should send If-Match header for conditional update", async () => {
		const patient = { resourceType: "Patient", id: "123" };
		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(patient), { status: 200 }));

		const client = createFhirClient({
			baseUrl: "https://test.com/fhir",
			accessToken: "my-token",
		});

		await client.update("Patient", "123", patient as never, 'W/"1"');

		const [, init] = fetchMock.mock.calls[0];
		expect(init.method).toBe("PUT");
		expect(init.headers["If-Match"]).toBe('W/"1"');
	});

	it("should handle 204 No Content for delete", async () => {
		fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

		const client = createFhirClient({
			baseUrl: "https://test.com/fhir",
			accessToken: "my-token",
		});

		const result = await client.delete("Patient", "123");
		expect(result.status).toBe(204);
	});

	it("should send POST for create", async () => {
		const observation = {
			resourceType: "Observation",
			id: "obs-1",
			status: "final",
			code: { coding: [{ system: "http://loinc.org", code: "8867-4" }] },
		};
		fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(observation), { status: 201 }));

		const client = createFhirClient({
			baseUrl: "https://test.com/fhir",
			accessToken: "my-token",
		});

		const result = await client.create("Observation", observation as never);
		expect(result.status).toBe(201);

		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("https://test.com/fhir/Observation");
		expect(init.method).toBe("POST");
	});
});
