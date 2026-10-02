import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { AdeptixClient, AdeptixApiError } from "../src/index.ts";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("AdeptixClient - crypto payments", () => {
  test("createPaymentRequest sends the right request and parses the response", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      capturedUrl = url.toString();
      capturedInit = init;
      return jsonResponse(201, {
        payment_request_id: "cpr_test",
        chain: "polygon",
        token: "USDC",
        pay_to_address: "0xabc",
        amount: "49.0001",
        expires_at: "2026-01-01T00:00:00.000Z",
      });
    }) as typeof fetch;

    const client = new AdeptixClient({ apiKey: "ak_live_test", fetch: fakeFetch });
    const result = await client.crypto.createPaymentRequest({
      chain: "polygon",
      token: "USDC",
      amount: "49.00",
      orderRef: "order_1",
    });

    assert.equal(capturedUrl, "https://api.adeptix.app/v1/crypto/payment-requests");
    assert.equal(capturedInit?.method, "POST");
    assert.equal((capturedInit?.headers as Record<string, string>).Authorization, "Bearer ak_live_test");
    const sentBody = JSON.parse(capturedInit!.body as string);
    assert.deepEqual(sentBody, { chain: "polygon", token: "USDC", amount: "49.00", order_ref: "order_1" });
    assert.equal(result.payment_request_id, "cpr_test");
    assert.equal(result.amount, "49.0001");
  });

  test("getPaymentRequest issues a GET to the right path", async () => {
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      assert.equal(url.toString(), "https://api.adeptix.app/v1/crypto/payment-requests/cpr_abc");
      assert.equal(init?.method, "GET");
      return jsonResponse(200, { payment_request_id: "cpr_abc", status: "pending", order_ref: null, requested_amount: "1", quoted_amount: "1", created_at: "x", expires_at: "y" });
    }) as typeof fetch;

    const client = new AdeptixClient({ apiKey: "ak_live_test", fetch: fakeFetch });
    const result = await client.crypto.getPaymentRequest("cpr_abc");
    assert.equal(result.status, "pending");
  });
});

describe("AdeptixClient - merchant payments", () => {
  test("payments.create sends the right request", async () => {
    const fakeFetch = (async () =>
      jsonResponse(201, { transaction_id: "txn_test", payment_url: "https://example.com/checkout" })) as typeof fetch;

    const client = new AdeptixClient({ apiKey: "ak_live_test", fetch: fakeFetch });
    const result = await client.payments.create({ amount: "10.00", currency: "usd", email: "a@b.com", provider: "stripe" });
    assert.equal(result.transaction_id, "txn_test");
    assert.equal(result.payment_url, "https://example.com/checkout");
  });

  test("payments.get returns status", async () => {
    const fakeFetch = (async () =>
      jsonResponse(200, {
        transaction_id: "txn_test",
        status: "paid",
        order_ref: null,
        currency: "USD",
        amount: "10.00",
        provider_id: "stripe",
        asset: "USDC",
        value_coin: "9.98",
        txid_out: "0x1",
        created_at: "x",
        paid_at: "y",
      })) as typeof fetch;

    const client = new AdeptixClient({ apiKey: "ak_live_test", fetch: fakeFetch });
    const result = await client.payments.get("txn_test");
    assert.equal(result.status, "paid");
  });
});

describe("AdeptixClient - error handling", () => {
  test("throws AdeptixApiError with the code and details from a 400 response", async () => {
    const fakeFetch = (async () =>
      jsonResponse(400, { error: "invalid_request", details: { fieldErrors: { amount: ["bad"] } } })) as typeof fetch;

    const client = new AdeptixClient({ apiKey: "ak_live_test", fetch: fakeFetch });
    await assert.rejects(
      () => client.payments.create({ amount: "bad", currency: "USD", email: "a@b.com", provider: "stripe" }),
      (err: unknown) => {
        assert.ok(err instanceof AdeptixApiError);
        assert.equal(err.status, 400);
        assert.equal(err.code, "invalid_request");
        assert.deepEqual(err.details, { fieldErrors: { amount: ["bad"] } });
        return true;
      },
    );
  });

  test("a POST is never retried on a 500", async () => {
    let callCount = 0;
    const fakeFetch = (async () => {
      callCount++;
      return jsonResponse(500, { error: "internal_error" });
    }) as typeof fetch;

    const client = new AdeptixClient({ apiKey: "ak_live_test", fetch: fakeFetch, maxRetries: 3 });
    await assert.rejects(() => client.payments.create({ amount: "1", currency: "USD", email: "a@b.com", provider: "stripe" }));
    assert.equal(callCount, 1);
  });

  test("a GET is retried on a 500 up to maxRetries, then succeeds", async () => {
    let callCount = 0;
    const fakeFetch = (async () => {
      callCount++;
      if (callCount < 3) return jsonResponse(500, { error: "internal_error" });
      return jsonResponse(200, { transaction_id: "txn_test", status: "paid", order_ref: null, currency: "USD", amount: "1", provider_id: "stripe", asset: null, value_coin: null, txid_out: null, created_at: "x", paid_at: null });
    }) as typeof fetch;

    const client = new AdeptixClient({ apiKey: "ak_live_test", fetch: fakeFetch, maxRetries: 3 });
    const result = await client.payments.get("txn_test");
    assert.equal(callCount, 3);
    assert.equal(result.status, "paid");
  });

  test("a GET gives up after maxRetries and throws the last error", async () => {
    let callCount = 0;
    const fakeFetch = (async () => {
      callCount++;
      return jsonResponse(503, { error: "platform_not_configured" });
    }) as typeof fetch;

    const client = new AdeptixClient({ apiKey: "ak_live_test", fetch: fakeFetch, maxRetries: 2 });
    await assert.rejects(
      () => client.payments.get("txn_test"),
      (err: unknown) => err instanceof AdeptixApiError && err.code === "platform_not_configured",
    );
    assert.equal(callCount, 3); // initial + 2 retries
  });
});
