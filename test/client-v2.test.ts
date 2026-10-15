import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { AdeptixClient, AdeptixApiError } from "../src/index.ts";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("AdeptixClient - idempotency keys and checkout fields", () => {
  test("payments.create sends the Idempotency-Key header and the new fields only when given", async () => {
    let init: RequestInit | undefined;
    const fakeFetch = (async (_url: string, i?: RequestInit) => {
      init = i;
      return jsonResponse(201, {
        transaction_id: "txn_1",
        payment_url: "https://x",
        order_ref: "o1",
        return_url: "https://shop.example.com/r",
        cancel_url: null,
        metadata: { a: "b" },
        description: "d",
      });
    }) as typeof fetch;
    const client = new AdeptixClient({ apiKey: "ak_live_test", fetch: fakeFetch });

    const result = await client.payments.create(
      {
        amount: "10.00",
        currency: "USD",
        email: "a@b.com",
        provider: "stripe",
        orderRef: "o1",
        returnUrl: "https://shop.example.com/r",
        description: "d",
        metadata: { a: "b" },
      },
      { idempotencyKey: "key-1" },
    );
    assert.equal((init?.headers as Record<string, string>)["Idempotency-Key"], "key-1");
    assert.deepEqual(JSON.parse(init!.body as string), {
      amount: "10.00",
      currency: "USD",
      email: "a@b.com",
      provider: "stripe",
      order_ref: "o1",
      return_url: "https://shop.example.com/r",
      description: "d",
      metadata: { a: "b" },
    });
    assert.equal(result.return_url, "https://shop.example.com/r");

    await client.payments.create({ amount: "10.00", currency: "USD", email: "a@b.com", provider: "stripe" });
    assert.equal("Idempotency-Key" in (init?.headers as Record<string, string>), false);
    assert.deepEqual(JSON.parse(init!.body as string), { amount: "10.00", currency: "USD", email: "a@b.com", provider: "stripe" });
  });

  test("crypto.createPaymentRequest passes the key and maps camelCase options", async () => {
    let init: RequestInit | undefined;
    const fakeFetch = (async (_url: string, i?: RequestInit) => {
      init = i;
      return jsonResponse(201, {
        payment_request_id: "cpr_1",
        chain: "tron",
        token: "USDT",
        pay_to_address: "T...",
        amount: "5",
        expires_at: "x",
        checkout_url: "https://dash.adeptix.app/pay/crypto/cpr_1",
        order_ref: null,
        return_url: null,
        cancel_url: "https://shop.example.com/c",
        metadata: null,
        description: null,
      });
    }) as typeof fetch;
    const client = new AdeptixClient({ apiKey: "ak_live_test", fetch: fakeFetch });
    const r = await client.crypto.createPaymentRequest(
      { chain: "tron", token: "USDT", amount: "5.00", cancelUrl: "https://shop.example.com/c" },
      { idempotencyKey: "k2" },
    );
    assert.equal((init?.headers as Record<string, string>)["Idempotency-Key"], "k2");
    assert.deepEqual(JSON.parse(init!.body as string), { chain: "tron", token: "USDT", amount: "5.00", cancel_url: "https://shop.example.com/c" });
    assert.equal(r.checkout_url, "https://dash.adeptix.app/pay/crypto/cpr_1");
  });

  test("a POST with an idempotency key is still never auto-retried", async () => {
    let calls = 0;
    const fakeFetch = (async () => {
      calls++;
      return jsonResponse(500, { error: "internal_error" });
    }) as typeof fetch;
    const client = new AdeptixClient({ apiKey: "ak_live_test", fetch: fakeFetch, maxRetries: 3 });
    await assert.rejects(() => client.payments.create({ amount: "1", currency: "USD", email: "a@b.com", provider: "stripe" }, { idempotencyKey: "k" }));
    assert.equal(calls, 1);
  });

  test("the new error codes surface on AdeptixApiError", async () => {
    const fakeFetch = (async () => jsonResponse(409, { error: "idempotent_request_in_progress" })) as typeof fetch;
    const client = new AdeptixClient({ apiKey: "ak_live_test", fetch: fakeFetch });
    await assert.rejects(
      () => client.payments.create({ amount: "1", currency: "USD", email: "a@b.com", provider: "stripe" }, { idempotencyKey: "k" }),
      (err: unknown) => err instanceof AdeptixApiError && err.status === 409 && err.code === "idempotent_request_in_progress",
    );
  });
});

describe("AdeptixClient - discovery", () => {
  test("providers.list unwraps data; providers.get hits the id path", async () => {
    const urls: string[] = [];
    const provider = { id: "stripe", name: "Stripe", minimum_amount: "2", minimum_currency: "USD", payment_methods: null, countries: null, status: "active" };
    const fakeFetch = (async (url: string) => {
      urls.push(url.toString());
      return jsonResponse(200, url.toString().endsWith("/providers") ? { data: [provider] } : provider);
    }) as typeof fetch;
    const client = new AdeptixClient({ apiKey: "ak_live_test", fetch: fakeFetch });
    const list = await client.providers.list();
    assert.equal(list[0]?.id, "stripe");
    const one = await client.providers.get("stripe");
    assert.equal(one.name, "Stripe");
    assert.deepEqual(urls, ["https://api.adeptix.app/v1/providers", "https://api.adeptix.app/v1/providers/stripe"]);
  });

  test("crypto.assets.list unwraps data", async () => {
    const asset = { id: "tron_usdt", chain: "tron", token: "USDT", decimals: 6, min_amount: "1.00", commission_rate_default: 0.005 };
    const fakeFetch = (async (url: string) => {
      assert.equal(url.toString(), "https://api.adeptix.app/v1/crypto/assets");
      return jsonResponse(200, { data: [asset] });
    }) as typeof fetch;
    const client = new AdeptixClient({ apiKey: "ak_live_test", fetch: fakeFetch });
    assert.deepEqual(await client.crypto.assets.list(), [asset]);
  });
});
