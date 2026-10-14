import { createHmac, timingSafeEqual } from "node:crypto";
/**
 * Verifies the `x-adeptix-signature` header against the raw (unparsed) request body using your
 * webhook secret. Always call this BEFORE JSON.parse-ing the body — signing covers the exact
 * bytes received, not whatever your JSON parser normalizes them to.
 *
 * @param rawBody The exact, unparsed request body (a string or Buffer).
 * @param signatureHeader The full `x-adeptix-signature` header value, e.g. "sha256=abcdef...".
 * @param webhookSecret Your account's webhook secret, from the Adeptix dashboard's Settings page.
 */
export function verifyWebhookSignature(rawBody, signatureHeader, webhookSecret) {
    if (!signatureHeader)
        return false;
    const provided = signatureHeader.replace(/^sha256=/, "");
    const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    let expectedBuf;
    let providedBuf;
    try {
        expectedBuf = Buffer.from(expected, "hex");
        providedBuf = Buffer.from(provided, "hex");
    }
    catch {
        return false;
    }
    return expectedBuf.length === providedBuf.length && timingSafeEqual(expectedBuf, providedBuf);
}
/**
 * Verifies the signature and parses the body in one step. Throws if the signature doesn't match
 * or the body isn't valid JSON — never returns an unverified event.
 */
export function parseWebhookEvent(rawBody, signatureHeader, webhookSecret) {
    if (!verifyWebhookSignature(rawBody, signatureHeader, webhookSecret)) {
        throw new Error("Adeptix webhook signature verification failed");
    }
    return JSON.parse(rawBody.toString("utf8"));
}
