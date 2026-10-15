import type { WebhookEvent } from "./types.ts";
/**
 * Verifies the `x-adeptix-signature` header against the raw (unparsed) request body using your
 * webhook secret. Always call this BEFORE JSON.parse-ing the body — signing covers the exact
 * bytes received, not whatever your JSON parser normalizes them to.
 *
 * @param rawBody The exact, unparsed request body (a string or Buffer).
 * @param signatureHeader The full `x-adeptix-signature` header value, e.g. "sha256=abcdef...".
 * @param webhookSecret Your account's webhook secret, from the Adeptix dashboard's Settings page.
 */
export declare function verifyWebhookSignature(rawBody: string | Buffer, signatureHeader: string | null | undefined, webhookSecret: string): boolean;
/** How far (seconds) a v2 signature timestamp may be from your clock. */
export declare const DEFAULT_TOLERANCE_SECONDS = 300;
export interface VerifyWebhookV2Options {
    /** Maximum allowed distance between the signature timestamp and now, in seconds. Default 300. */
    toleranceSeconds?: number;
    /** Current time in unix seconds. Defaults to the real clock; for tests. */
    now?: number;
}
/**
 * Verifies the `Adeptix-Signature` header (`t=<unix seconds>,v1=<hex>`): an HMAC-SHA256 over
 * `"<t>.<raw body>"`, with replay protection. Returns false (never throws) for a missing or malformed
 * header, a timestamp outside the tolerance window, or a signature that doesn't match any `v1` value.
 * Call this BEFORE JSON.parse-ing the body.
 *
 * This is the recommended scheme; `verifyWebhookSignature` (the `x-adeptix-signature` header) keeps
 * working unchanged for receivers that haven't moved over.
 */
export declare function verifyWebhookSignatureV2(rawBody: string | Buffer, signatureHeader: string | null | undefined, webhookSecret: string, options?: VerifyWebhookV2Options): boolean;
/**
 * Verifies the `Adeptix-Signature` header (see verifyWebhookSignatureV2) and parses the body in one
 * step. Throws if verification fails or the body isn't valid JSON — never returns an unverified
 * event. Branch on `event.event` and acknowledge (2xx) types you don't handle; deduplicate on
 * `event.id`.
 */
export declare function constructEvent(rawBody: string | Buffer, signatureHeader: string | null | undefined, webhookSecret: string, options?: VerifyWebhookV2Options): WebhookEvent;
/**
 * Verifies the signature and parses the body in one step. Throws if the signature doesn't match
 * or the body isn't valid JSON — never returns an unverified event.
 */
export declare function parseWebhookEvent(rawBody: string | Buffer, signatureHeader: string | null | undefined, webhookSecret: string): WebhookEvent;
