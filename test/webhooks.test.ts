import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyWebhookSignature, parseWebhookEvent } from "../src/index.ts";

const SECRET = "whsec_test_secret";

function sign(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

describe("verifyWebhookSignature", () => {
  test("accepts a correctly signed payload", () => {
    const body = JSON.stringify({ event: "payment.paid", transaction_id: "txn_1" });
    const signature = sign(body, SECRET);
    assert.equal(verifyWebhookSignature(body, signature, SECRET), true);
  });

  test("rejects a tampered payload", () => {
    const body = JSON.stringify({ event: "payment.paid", transaction_id: "txn_1" });
    const signature = sign(body, SECRET);
    const tamperedBody = JSON.stringify({ event: "payment.paid", transaction_id: "txn_2" });
    assert.equal(verifyWebhookSignature(tamperedBody, signature, SECRET), false);
  });

  test("rejects a signature made with the wrong secret", () => {
    const body = JSON.stringify({ event: "payment.paid", transaction_id: "txn_1" });
    const signature = sign(body, "wrong_secret");
    assert.equal(verifyWebhookSignature(body, signature, SECRET), false);
  });

  test("rejects a missing signature header", () => {
    assert.equal(verifyWebhookSignature("{}", undefined, SECRET), false);
    assert.equal(verifyWebhookSignature("{}", null, SECRET), false);
  });

  test("rejects a malformed (non-hex) signature without throwing", () => {
    assert.equal(verifyWebhookSignature("{}", "sha256=not-hex-!!", SECRET), false);
  });

  test("works with a Buffer body, not just a string", () => {
    const body = JSON.stringify({ event: "payment.paid" });
    const signature = sign(body, SECRET);
    assert.equal(verifyWebhookSignature(Buffer.from(body, "utf8"), signature, SECRET), true);
  });
});

describe("parseWebhookEvent", () => {
  test("returns the parsed event when the signature is valid", () => {
    const body = JSON.stringify({ event: "crypto_payment.matched", payment_request_id: "cpr_1" });
    const signature = sign(body, SECRET);
    const parsed = parseWebhookEvent(body, signature, SECRET);
    assert.equal(parsed.event, "crypto_payment.matched");
  });

  test("throws when the signature is invalid", () => {
    const body = JSON.stringify({ event: "payment.paid" });
    assert.throws(() => parseWebhookEvent(body, "sha256=wrong", SECRET));
  });
});
