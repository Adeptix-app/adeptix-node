/**
 * Thrown for any non-2xx response from the Adeptix API. `code` matches the `error` field
 * documented at https://docs.adeptix.app/errors — always check `code`, not `message` (which
 * isn't guaranteed to be present or stable across API versions).
 */
export class AdeptixApiError extends Error {
    status;
    code;
    details;
    constructor(status, body) {
        super(body.message ?? `Adeptix API request failed with ${status} (${body.error})`);
        this.name = "AdeptixApiError";
        this.status = status;
        this.code = body.error;
        this.details = body.details;
    }
}
/** Thrown when the API returns a non-JSON or unrecognized error body — a genuine surprise, not a normal error path. */
export class AdeptixUnexpectedResponseError extends Error {
    status;
    bodyText;
    constructor(status, bodyText) {
        super(`Adeptix API returned an unexpected ${status} response`);
        this.name = "AdeptixUnexpectedResponseError";
        this.status = status;
        this.bodyText = bodyText;
    }
}
