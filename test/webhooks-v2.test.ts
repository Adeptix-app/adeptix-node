import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyWebhookSignature, verifyWebhookSignatureV2, constructEvent } from "../src/index.ts";

// Webhooks v2: `Adeptix-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`.

const SECRET = "whsec_test_secret";
const NOW = 1_800_000_000;

function sign(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

function signV2(body: string | Buffer, secret: string, ts: number): string {
  return `t=${ts},v1=${createHmac("sha256", secret).update(`${ts}.`).update(body).digest("hex")}`;
}

describe("verifyWebhookSignatureV2", () => {
  // Fixed vector shared with the Python and PHP SDK tests: all three must agree on it.
  test("matches the cross-SDK test vector", () => {
    const body = '{"event":"payment.paid","id":"evt_1"}';
    const header = "t=1800000000,v1=eef418a69de72d5244d7bd44535f9c515ed4fa7cbb9f241319d4f372078c37b7";
    assert.equal(verifyWebhookSignatureV2(body, header, SECRET, { now: NOW }), true);
  });

  test("accepts a valid signature, string or Buffer body, inside the tolerance window", () => {
    const body = JSON.stringify({ event: "payment.paid", id: "evt_1" });
    const header = signV2(body, SECRET, NOW);
    assert.equal(verifyWebhookSignatureV2(body, header, SECRET, { now: NOW }), true);
    assert.equal(verifyWebhookSignatureV2(Buffer.from(body), header, SECRET, { now: NOW + 300 }), true);
    assert.equal(verifyWebhookSignatureV2(body, header, SECRET, { now: NOW - 300 }), true);
  });

  test("rejects a stale or future timestamp; tolerance is configurable", () => {
    const body = "{}";
    const header = signV2(body, SECRET, NOW);
    assert.equal(verifyWebhookSignatureV2(body, header, SECRET, { now: NOW + 301 }), false);
    assert.equal(verifyWebhookSignatureV2(body, header, SECRET, { now: NOW - 301 }), false);
    assert.equal(verifyWebhookSignatureV2(body, header, SECRET, { now: NOW + 600, toleranceSeconds: 900 }), true);
  });

  test("rejects a tampered body, wrong secret, and a re-stamped timestamp", () => {
    const body = JSON.stringify({ event: "payment.paid" });
    const header = signV2(body, SECRET, NOW);
    assert.equal(verifyWebhookSignatureV2(body + " ", header, SECRET, { now: NOW }), false);
    assert.equal(verifyWebhookSignatureV2(body, header, "other", { now: NOW }), false);
    assert.equal(verifyWebhookSignatureV2(body, header.replace(`t=${NOW}`, `t=${NOW + 1}`), SECRET, { now: NOW }), false);
  });

  test("a v1 (legacy) signature is not a valid v2 signature and vice versa", () => {
    const body = "{}";
    assert.equal(verifyWebhookSignatureV2(body, sign(body, SECRET), SECRET, { now: NOW }), false);
    assert.equal(verifyWebhookSignature(body, signV2(body, SECRET, NOW), SECRET), false);
  });

  test("accepts any matching v1 (key rotation) and ignores unknown keys; never throws on garbage", () => {
    const body = "{}";
    const good = signV2(body, SECRET, NOW).split("v1=")[1];
    assert.equal(verifyWebhookSignatureV2(body, `t=${NOW},v1=${"0".repeat(64)},v1=${good}`, SECRET, { now: NOW }), true);
    assert.equal(verifyWebhookSignatureV2(body, `v0=x, t=${NOW} , v1=${good}, future=1`, SECRET, { now: NOW }), true);
    const garbage = [undefined, null, "", "garbage", "t=,v1=", `t=abc,v1=${good}`, `v1=${good}`, `t=${NOW}`, `t=${NOW},t=${NOW},v1=${good}`, `t=${NOW},v1=zz`];
    for (const h of garbage) {
      assert.equal(verifyWebhookSignatureV2(body, h, SECRET, { now: NOW }), false, String(h));
    }
  });

  test("the legacy verifier still works unchanged", () => {
    const body = JSON.stringify({ event: "payment.paid" });
    assert.equal(verifyWebhookSignature(body, sign(body, SECRET), SECRET), true);
  });
});

describe("constructEvent", () => {
  test("returns the typed event for a valid v2 delivery, including the new event types", () => {
    for (const eventName of ["payment.paid", "payment.failed", "crypto_payment.matched", "crypto_payment.expired"]) {
      const body = JSON.stringify({ event: eventName, id: "evt_1", created: NOW, api_version: "2026-10-15" });
      const ev = constructEvent(body, signV2(body, SECRET, Math.floor(Date.now() / 1000)), SECRET);
      assert.equal(ev.event, eventName);
      assert.equal(ev.id, "evt_1");
    }
  });

  test("throws on a bad signature or a stale timestamp, and never returns an unverified event", () => {
    const body = JSON.stringify({ event: "payment.paid" });
    assert.throws(() => constructEvent(body, "t=1,v1=" + "0".repeat(64), SECRET));
    assert.throws(() => constructEvent(body, signV2(body, SECRET, 1_000), SECRET));
    assert.throws(() => constructEvent(body, undefined, SECRET));
  });
});
