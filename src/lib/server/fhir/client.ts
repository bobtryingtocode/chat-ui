import { getFhirBaseUrl, fhirConfig } from "./config";
import { logger } from "$lib/server/logger";
import type {
	FhirBundle,
	FhirOperationOutcome,
	FhirResource,
	FhirResourceType,
} from "$lib/types/FhirResource";

/**
 * FHIR R4 HTTP Client
 *
 * Provides a typed interface to a FHIR R4 server (Google Healthcare API or
 * any FHIR-compliant endpoint). All methods follow the FHIR RESTful API spec:
 * https://hl7.org/fhir/R4/http.html
 *
 * Features:
 * - Full CRUD for Patient, Observation, Condition
 * - Search with FHIR search parameters
 * - Bundle/transaction support
 * - Proper FHIR content negotiation
 * - TLS enforcement for HIPAA compliance
 */

export interface FhirClientOptions {
	/** Override the default FHIR base URL */
	baseUrl?: string;
	/** OAuth access token for authorization */
	accessToken: string;
	/** Request timeout in milliseconds */
	timeout?: number;
}

export interface FhirResponse<T> {
	status: number;
	resource: T;
	headers: Record<string, string>;
	etag?: string;
	lastModified?: string;
}

function fhirHeaders(accessToken: string, extraHeaders?: Record<string, string>): HeadersInit {
	return {
		Authorization: `Bearer ${accessToken}`,
		Accept: "application/fhir+json",
		"Content-Type": "application/fhir+json",
		...extraHeaders,
	};
}

function validateTls(url: string): void {
	if (fhirConfig.requireTls && !url.startsWith("https://")) {
		throw new Error(`FHIR connection requires TLS. Refusing to connect to: ${url}`);
	}
}

function buildSearchUrl(
	baseUrl: string,
	resourceType: string,
	params: Record<string, string | number | undefined>
): string {
	const url = new URL(`${baseUrl}/${resourceType}`);
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined && value !== "") {
			url.searchParams.set(key, String(value));
		}
	}
	return url.toString();
}

async function handleFhirResponse<T>(response: Response): Promise<FhirResponse<T>> {
	const headers: Record<string, string> = {};
	response.headers.forEach((value, key) => {
		headers[key] = value;
	});

	if (!response.ok) {
		let operationOutcome: FhirOperationOutcome | undefined;
		try {
			operationOutcome = (await response.json()) as FhirOperationOutcome;
		} catch {
			// Response may not be JSON
		}

		const error = new FhirError(
			`FHIR request failed: ${response.status} ${response.statusText}`,
			response.status,
			operationOutcome
		);
		throw error;
	}

	// 204 No Content (e.g., successful DELETE)
	if (response.status === 204) {
		return {
			status: response.status,
			resource: undefined as unknown as T,
			headers,
		};
	}

	const resource = (await response.json()) as T;
	return {
		status: response.status,
		resource,
		headers,
		etag: headers["etag"],
		lastModified: headers["last-modified"],
	};
}

export class FhirError extends Error {
	constructor(
		message: string,
		public readonly status: number,
		public readonly operationOutcome?: FhirOperationOutcome
	) {
		super(message);
		this.name = "FhirError";
	}
}

/**
 * Create a FHIR client bound to a specific access token.
 */
export function createFhirClient(options: FhirClientOptions) {
	const baseUrl = (options.baseUrl || getFhirBaseUrl()).replace(/\/$/, "");
	const { accessToken, timeout = 30000 } = options;

	validateTls(baseUrl);

	async function fhirFetch<T>(url: string, init: RequestInit = {}): Promise<FhirResponse<T>> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);

		try {
			const response = await fetch(url, {
				...init,
				signal: controller.signal,
				headers: {
					...fhirHeaders(accessToken),
					...(init.headers as Record<string, string>),
				},
			});
			return handleFhirResponse<T>(response);
		} catch (err) {
			if (err instanceof FhirError) throw err;
			if (err instanceof DOMException && err.name === "AbortError") {
				throw new FhirError("FHIR request timed out", 408);
			}
			logger.error(err, "FHIR client network error");
			throw new FhirError("FHIR server unreachable", 502);
		} finally {
			clearTimeout(timeoutId);
		}
	}

	return {
		// ── Read ────────────────────────────────────────────────────────
		async read<T extends FhirResource>(
			resourceType: FhirResourceType,
			id: string
		): Promise<FhirResponse<T>> {
			const url = `${baseUrl}/${resourceType}/${encodeURIComponent(id)}`;
			return fhirFetch<T>(url, { method: "GET" });
		},

		// ── VRead (version-specific read) ───────────────────────────────
		async vread<T extends FhirResource>(
			resourceType: FhirResourceType,
			id: string,
			versionId: string
		): Promise<FhirResponse<T>> {
			const url = `${baseUrl}/${resourceType}/${encodeURIComponent(id)}/_history/${encodeURIComponent(versionId)}`;
			return fhirFetch<T>(url, { method: "GET" });
		},

		// ── Search ──────────────────────────────────────────────────────
		async search<T extends FhirResource>(
			resourceType: FhirResourceType | string,
			params: Record<string, string | number | undefined> = {}
		): Promise<FhirResponse<FhirBundle<T>>> {
			const url = buildSearchUrl(baseUrl, resourceType, params);
			return fhirFetch<FhirBundle<T>>(url, { method: "GET" });
		},

		// ── Create ──────────────────────────────────────────────────────
		async create<T extends FhirResource>(
			resourceType: FhirResourceType,
			resource: T
		): Promise<FhirResponse<T>> {
			const url = `${baseUrl}/${resourceType}`;
			return fhirFetch<T>(url, {
				method: "POST",
				body: JSON.stringify(resource),
			});
		},

		// ── Update (PUT) ────────────────────────────────────────────────
		async update<T extends FhirResource>(
			resourceType: FhirResourceType,
			id: string,
			resource: T,
			ifMatch?: string
		): Promise<FhirResponse<T>> {
			const url = `${baseUrl}/${resourceType}/${encodeURIComponent(id)}`;
			const headers: Record<string, string> = {};
			if (ifMatch) {
				headers["If-Match"] = ifMatch;
			}
			return fhirFetch<T>(url, {
				method: "PUT",
				body: JSON.stringify({ ...resource, id }),
				headers,
			});
		},

		// ── Patch ───────────────────────────────────────────────────────
		async patch<T extends FhirResource>(
			resourceType: FhirResourceType,
			id: string,
			operations: Array<{ op: string; path: string; value?: unknown }>
		): Promise<FhirResponse<T>> {
			const url = `${baseUrl}/${resourceType}/${encodeURIComponent(id)}`;
			return fhirFetch<T>(url, {
				method: "PATCH",
				body: JSON.stringify(operations),
				headers: { "Content-Type": "application/json-patch+json" },
			});
		},

		// ── Delete ──────────────────────────────────────────────────────
		async delete(
			resourceType: FhirResourceType,
			id: string
		): Promise<FhirResponse<FhirOperationOutcome>> {
			const url = `${baseUrl}/${resourceType}/${encodeURIComponent(id)}`;
			return fhirFetch<FhirOperationOutcome>(url, { method: "DELETE" });
		},

		// ── History ─────────────────────────────────────────────────────
		async history<T extends FhirResource>(
			resourceType: FhirResourceType,
			id: string,
			params: Record<string, string | number | undefined> = {}
		): Promise<FhirResponse<FhirBundle<T>>> {
			const searchParams = new URLSearchParams();
			for (const [key, value] of Object.entries(params)) {
				if (value !== undefined) searchParams.set(key, String(value));
			}
			const qs = searchParams.toString();
			const url = `${baseUrl}/${resourceType}/${encodeURIComponent(id)}/_history${qs ? `?${qs}` : ""}`;
			return fhirFetch<FhirBundle<T>>(url, { method: "GET" });
		},

		// ── Transaction / Batch ─────────────────────────────────────────
		async transaction(bundle: FhirBundle): Promise<FhirResponse<FhirBundle>> {
			return fhirFetch<FhirBundle>(baseUrl, {
				method: "POST",
				body: JSON.stringify(bundle),
			});
		},

		// ── Capability Statement ────────────────────────────────────────
		async capabilities(): Promise<FhirResponse<Record<string, unknown>>> {
			const url = `${baseUrl}/metadata`;
			return fhirFetch<Record<string, unknown>>(url, {
				method: "GET",
				headers: { Accept: "application/fhir+json" },
			});
		},
	};
}

export type FhirClient = ReturnType<typeof createFhirClient>;
