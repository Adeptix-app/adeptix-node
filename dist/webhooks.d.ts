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
/**
 * Verifies the signature and parses the body in one step. Throws if the signature doesn't match
 * or the body isn't valid JSON — never returns an unverified event.
 */
export declare function parseWebhookEvent(rawBody: string | Buffer, signatureHeader: string | null | undefined, webhookSecret: string): WebhookEvent;
