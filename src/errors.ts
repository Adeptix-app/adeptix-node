/** Every error code either API can return — see https://docs.adeptix.app/errors */
export type AdeptixErrorCode =
  | "unauthorized"
  | "invalid_request"
  | "not_found"
  | "platform_not_configured"
  | "internal_error"
  | "asset_unavailable"
  | "no_quote_available"
  | "too_many_pending_requests"
  | "provider_unavailable"
  | "provider_disabled_for_account"
  | "checkout_provider_error"
  | (string & {});

export interface AdeptixErrorBody {
  error: string;
  message?: string;
  details?: unknown;
}

/**
 * Thrown for any non-2xx response from the Adeptix API. `code` matches the `error` field
 * documented at https://docs.adeptix.app/errors — always check `code`, not `message` (which
 * isn't guaranteed to be present or stable across API versions).
 */
export class AdeptixApiError extends Error {
  readonly status: number;
  readonly code: AdeptixErrorCode;
  readonly details: unknown;

  constructor(status: number, body: AdeptixErrorBody) {
    super(body.message ?? `Adeptix API request failed with ${status} (${body.error})`);
    this.name = "AdeptixApiError";
    this.status = status;
    this.code = body.error;
    this.details = body.details;
  }
}

/** Thrown when the API returns a non-JSON or unrecognized error body — a genuine surprise, not a normal error path. */
export class AdeptixUnexpectedResponseError extends Error {
  readonly status: number;
  readonly bodyText: string;

  constructor(status: number, bodyText: string) {
    super(`Adeptix API returned an unexpected ${status} response`);
    this.name = "AdeptixUnexpectedResponseError";
    this.status = status;
    this.bodyText = bodyText;
  }
}
