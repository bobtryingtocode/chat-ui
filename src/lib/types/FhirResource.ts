import type { ObjectId } from "mongodb";
import type { Timestamps } from "./Timestamps";

// ── FHIR R4 Base Types ──────────────────────────────────────────────────────

export interface FhirMeta {
	versionId?: string;
	lastUpdated?: string;
	source?: string;
	profile?: string[];
	security?: FhirCoding[];
	tag?: FhirCoding[];
}

export interface FhirCoding {
	system?: string;
	version?: string;
	code?: string;
	display?: string;
	userSelected?: boolean;
}

export interface FhirCodeableConcept {
	coding?: FhirCoding[];
	text?: string;
}

export interface FhirIdentifier {
	use?: "usual" | "official" | "temp" | "secondary" | "old";
	type?: FhirCodeableConcept;
	system?: string;
	value?: string;
	period?: FhirPeriod;
}

export interface FhirPeriod {
	start?: string;
	end?: string;
}

export interface FhirReference {
	reference?: string;
	type?: string;
	identifier?: FhirIdentifier;
	display?: string;
}

export interface FhirHumanName {
	use?: "usual" | "official" | "temp" | "nickname" | "anonymous" | "old" | "maiden";
	text?: string;
	family?: string;
	given?: string[];
	prefix?: string[];
	suffix?: string[];
	period?: FhirPeriod;
}

export interface FhirContactPoint {
	system?: "phone" | "fax" | "email" | "pager" | "url" | "sms" | "other";
	value?: string;
	use?: "home" | "work" | "temp" | "old" | "mobile";
	rank?: number;
	period?: FhirPeriod;
}

export interface FhirAddress {
	use?: "home" | "work" | "temp" | "old" | "billing";
	type?: "postal" | "physical" | "both";
	text?: string;
	line?: string[];
	city?: string;
	district?: string;
	state?: string;
	postalCode?: string;
	country?: string;
	period?: FhirPeriod;
}

export interface FhirQuantity {
	value?: number;
	comparator?: "<" | "<=" | ">=" | ">";
	unit?: string;
	system?: string;
	code?: string;
}

export interface FhirAnnotation {
	authorReference?: FhirReference;
	authorString?: string;
	time?: string;
	text: string;
}

export interface FhirNarrative {
	status: "generated" | "extensions" | "additional" | "empty";
	div: string;
}

// ── FHIR OperationOutcome ───────────────────────────────────────────────────

export interface FhirOperationOutcomeIssue {
	severity: "fatal" | "error" | "warning" | "information";
	code: string;
	details?: FhirCodeableConcept;
	diagnostics?: string;
	location?: string[];
	expression?: string[];
}

export interface FhirOperationOutcome {
	resourceType: "OperationOutcome";
	id?: string;
	meta?: FhirMeta;
	issue: FhirOperationOutcomeIssue[];
}

// ── FHIR Patient ────────────────────────────────────────────────────────────

export interface FhirPatient {
	resourceType: "Patient";
	id?: string;
	meta?: FhirMeta;
	text?: FhirNarrative;
	identifier?: FhirIdentifier[];
	active?: boolean;
	name?: FhirHumanName[];
	telecom?: FhirContactPoint[];
	gender?: "male" | "female" | "other" | "unknown";
	birthDate?: string;
	deceasedBoolean?: boolean;
	deceasedDateTime?: string;
	address?: FhirAddress[];
	maritalStatus?: FhirCodeableConcept;
	communication?: Array<{
		language: FhirCodeableConcept;
		preferred?: boolean;
	}>;
	generalPractitioner?: FhirReference[];
	managingOrganization?: FhirReference;
}

// ── FHIR Observation ────────────────────────────────────────────────────────

export interface FhirObservation {
	resourceType: "Observation";
	id?: string;
	meta?: FhirMeta;
	text?: FhirNarrative;
	identifier?: FhirIdentifier[];
	status:
		| "registered"
		| "preliminary"
		| "final"
		| "amended"
		| "corrected"
		| "cancelled"
		| "entered-in-error"
		| "unknown";
	category?: FhirCodeableConcept[];
	code: FhirCodeableConcept;
	subject?: FhirReference;
	encounter?: FhirReference;
	effectiveDateTime?: string;
	effectivePeriod?: FhirPeriod;
	issued?: string;
	performer?: FhirReference[];
	valueQuantity?: FhirQuantity;
	valueCodeableConcept?: FhirCodeableConcept;
	valueString?: string;
	valueBoolean?: boolean;
	valueInteger?: number;
	valueDateTime?: string;
	valuePeriod?: FhirPeriod;
	interpretation?: FhirCodeableConcept[];
	note?: FhirAnnotation[];
	bodySite?: FhirCodeableConcept;
	method?: FhirCodeableConcept;
	referenceRange?: Array<{
		low?: FhirQuantity;
		high?: FhirQuantity;
		type?: FhirCodeableConcept;
		appliesTo?: FhirCodeableConcept[];
		age?: { low?: FhirQuantity; high?: FhirQuantity };
		text?: string;
	}>;
	component?: Array<{
		code: FhirCodeableConcept;
		valueQuantity?: FhirQuantity;
		valueCodeableConcept?: FhirCodeableConcept;
		valueString?: string;
		valueBoolean?: boolean;
		valueInteger?: number;
		valueDateTime?: string;
		valuePeriod?: FhirPeriod;
		interpretation?: FhirCodeableConcept[];
		referenceRange?: Array<{
			low?: FhirQuantity;
			high?: FhirQuantity;
			type?: FhirCodeableConcept;
			text?: string;
		}>;
	}>;
}

// ── FHIR Condition ──────────────────────────────────────────────────────────

export interface FhirCondition {
	resourceType: "Condition";
	id?: string;
	meta?: FhirMeta;
	text?: FhirNarrative;
	identifier?: FhirIdentifier[];
	clinicalStatus?: FhirCodeableConcept;
	verificationStatus?: FhirCodeableConcept;
	category?: FhirCodeableConcept[];
	severity?: FhirCodeableConcept;
	code?: FhirCodeableConcept;
	bodySite?: FhirCodeableConcept[];
	subject: FhirReference;
	encounter?: FhirReference;
	onsetDateTime?: string;
	onsetAge?: FhirQuantity;
	onsetPeriod?: FhirPeriod;
	onsetString?: string;
	abatementDateTime?: string;
	abatementAge?: FhirQuantity;
	abatementPeriod?: FhirPeriod;
	abatementString?: string;
	recordedDate?: string;
	recorder?: FhirReference;
	asserter?: FhirReference;
	note?: FhirAnnotation[];
}

// ── FHIR Bundle ─────────────────────────────────────────────────────────────

export interface FhirBundleEntry<T = FhirResource> {
	fullUrl?: string;
	resource?: T;
	search?: {
		mode?: "match" | "include" | "outcome";
		score?: number;
	};
	request?: {
		method: "GET" | "HEAD" | "POST" | "PUT" | "DELETE" | "PATCH";
		url: string;
		ifNoneMatch?: string;
		ifModifiedSince?: string;
		ifMatch?: string;
		ifNoneExist?: string;
	};
	response?: {
		status: string;
		location?: string;
		etag?: string;
		lastModified?: string;
		outcome?: FhirOperationOutcome;
	};
}

export interface FhirBundle<T = FhirResource> {
	resourceType: "Bundle";
	id?: string;
	meta?: FhirMeta;
	type:
		| "document"
		| "message"
		| "transaction"
		| "transaction-response"
		| "batch"
		| "batch-response"
		| "history"
		| "searchset"
		| "collection";
	total?: number;
	link?: Array<{
		relation: string;
		url: string;
	}>;
	entry?: FhirBundleEntry<T>[];
}

// ── FHIR CapabilityStatement ────────────────────────────────────────────────

export interface FhirCapabilityStatement {
	resourceType: "CapabilityStatement";
	id?: string;
	url?: string;
	version?: string;
	name?: string;
	title?: string;
	status: "draft" | "active" | "retired" | "unknown";
	experimental?: boolean;
	date: string;
	publisher?: string;
	description?: string;
	kind: "instance" | "capability" | "requirements";
	fhirVersion: string;
	format: string[];
	rest?: Array<{
		mode: "client" | "server";
		documentation?: string;
		security?: {
			cors?: boolean;
			service?: FhirCodeableConcept[];
			description?: string;
			extension?: Array<{
				url: string;
				extension?: Array<{
					url: string;
					valueUri?: string;
				}>;
			}>;
		};
		resource?: Array<{
			type: string;
			profile?: string;
			interaction?: Array<{
				code: string;
				documentation?: string;
			}>;
			versioning?: "no-version" | "versioned" | "versioned-update";
			readHistory?: boolean;
			updateCreate?: boolean;
			searchParam?: Array<{
				name: string;
				type:
					| "number"
					| "date"
					| "string"
					| "token"
					| "reference"
					| "composite"
					| "quantity"
					| "uri"
					| "special";
				documentation?: string;
			}>;
		}>;
	}>;
}

// ── Union type for supported resources ──────────────────────────────────────

export type FhirResource = FhirPatient | FhirObservation | FhirCondition;
export type FhirResourceType = "Patient" | "Observation" | "Condition";

// ── FHIR Audit Event (for HIPAA compliance) ─────────────────────────────────

export interface FhirAuditEvent {
	resourceType: "AuditEvent";
	id?: string;
	meta?: FhirMeta;
	type: FhirCoding;
	subtype?: FhirCoding[];
	action?: "C" | "R" | "U" | "D" | "E";
	period?: FhirPeriod;
	recorded: string;
	outcome?: "0" | "4" | "8" | "12";
	outcomeDesc?: string;
	agent: Array<{
		type?: FhirCodeableConcept;
		who?: FhirReference;
		requestor: boolean;
		network?: {
			address?: string;
			type?: "1" | "2" | "3" | "4" | "5";
		};
	}>;
	source: {
		site?: string;
		observer: FhirReference;
		type?: FhirCoding[];
	};
	entity?: Array<{
		what?: FhirReference;
		type?: FhirCoding;
		role?: FhirCoding;
		lifecycle?: FhirCoding;
		securityLabel?: FhirCoding[];
		name?: string;
		description?: string;
		query?: string;
	}>;
}

// ── MongoDB storage types ───────────────────────────────────────────────────

export interface FhirAuditLog extends Timestamps {
	_id: ObjectId;
	event: FhirAuditEvent;
	userId?: string;
	sessionId?: string;
	resourceType: string;
	resourceId?: string;
	action: "create" | "read" | "update" | "delete" | "search";
	outcome: "success" | "failure";
	ip?: string;
	userAgent?: string;
}

export interface FhirOAuthToken extends Timestamps {
	_id: ObjectId;
	userId: string;
	sessionId: string;
	provider: "google" | "smart-on-fhir";
	accessToken: string;
	refreshToken?: string;
	expiresAt: Date;
	scopes: string[];
	fhirServerUrl?: string;
	patientId?: string;
}

export interface FhirConsent extends Timestamps {
	_id: ObjectId;
	userId: string;
	patientId: string;
	scope: string[];
	status: "active" | "inactive" | "rejected";
	dateTime: Date;
	expiresAt?: Date;
}
