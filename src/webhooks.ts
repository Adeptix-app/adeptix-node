import { createHmac, timingSafeEqual } from "node:crypto";
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
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  webhookSecret: string,
): boolean {
  if (!signatureHeader) return false;

  const provided = signatureHeader.replace(/^sha256=/, "");
  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");

  let expectedBuf: Buffer;
  let providedBuf: Buffer;
  try {
    expectedBuf = Buffer.from(expected, "hex");
    providedBuf = Buffer.from(provided, "hex");
  } catch {
    return false;
  }

  return expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
}

/** How far (seconds) a v2 signature timestamp may be from your clock. */
export const DEFAULT_TOLERANCE_SECONDS = 300;

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
export function verifyWebhookSignatureV2(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  webhookSecret: string,
  options: VerifyWebhookV2Options = {},
): boolean {
  if (!signatureHeader) return false;

  let timestamp: string | null = null;
  const candidates: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") {
      if (timestamp !== null || !/^\d{1,12}$/.test(value)) return false;
      timestamp = value;
    } else if (key === "v1" && /^[0-9a-fA-F]{64}$/.test(value)) {
      candidates.push(value.toLowerCase());
    }
  }
  if (timestamp === null || candidates.length === 0) return false;

  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > tolerance) return false;

  const expected = createHmac("sha256", webhookSecret).update(`${timestamp}.`).update(rawBody).digest();
  let ok = false;
  for (const candidate of candidates) {
    const candidateBuf = Buffer.from(candidate, "hex");
    ok = (candidateBuf.length === expected.length && timingSafeEqual(candidateBuf, expected)) || ok;
  }
  return ok;
}

/**
 * Verifies the `Adeptix-Signature` header (see verifyWebhookSignatureV2) and parses the body in one
 * step. Throws if verification fails or the body isn't valid JSON — never returns an unverified
 * event. Branch on `event.event` and acknowledge (2xx) types you don't handle; deduplicate on
 * `event.id`.
 */
export function constructEvent(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  webhookSecret: string,
  options: VerifyWebhookV2Options = {},
): WebhookEvent {
  if (!verifyWebhookSignatureV2(rawBody, signatureHeader, webhookSecret, options)) {
    throw new Error("Adeptix webhook signature verification failed");
  }
  return JSON.parse(rawBody.toString("utf8")) as WebhookEvent;
}

/**
 * Verifies the signature and parses the body in one step. Throws if the signature doesn't match
 * or the body isn't valid JSON — never returns an unverified event.
 */
export function parseWebhookEvent(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  webhookSecret: string,
): WebhookEvent {
  if (!verifyWebhookSignature(rawBody, signatureHeader, webhookSecret)) {
    throw new Error("Adeptix webhook signature verification failed");
  }
  return JSON.parse(rawBody.toString("utf8")) as WebhookEvent;
}
