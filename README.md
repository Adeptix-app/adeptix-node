# adeptix

Official Node.js / TypeScript SDK for the [Adeptix API](https://docs.adeptix.app) — direct on-chain
crypto payments and hosted card/bank/wallet checkouts, from a single client.

Full API reference: **https://docs.adeptix.app**

## Install

Install straight from GitHub (npm builds the package on install):

```bash
npm install github:Adeptix-app/adeptix-node
```

To pin a specific release instead of tracking the latest, add its tag:

```bash
npm install github:Adeptix-app/adeptix-node#v0.1.0
```

Requires Node.js 18 or later (uses the global `fetch`).

## Quickstart

```ts
import { AdeptixClient } from "adeptix";

const client = new AdeptixClient({ apiKey: process.env.ADEPTIX_API_KEY! });
```

### Crypto Payments API

```ts
const request = await client.crypto.createPaymentRequest({
  chain: "polygon",
  token: "USDC",
  amount: "49.00",
  orderRef: "order_10231",
});

// Show request.amount and request.pay_to_address to the customer.
// request.amount may differ slightly from "49.00" - see the docs' note on
// how deposits are matched by exact amount, not by a per-request address.

const status = await client.crypto.getPaymentRequest(request.payment_request_id);
// status.status: "pending" | "matched" | "expired"
```

### Merchant Payments API

```ts
const payment = await client.payments.create({
  amount: "49.00",
  currency: "USD",
  email: "customer@example.com",
  provider: "stripe",
  orderRef: "order_10231",
});

// Redirect the customer's browser to payment.payment_url.

const status = await client.payments.get(payment.transaction_id);
// status.status: "pending" | "paid" | "failed" | "expired"
```

## Webhooks

Prefer webhooks over polling — see **https://docs.adeptix.app/webhooks** for how to configure a
webhook URL and secret from your dashboard.

```ts
import { parseWebhookEvent } from "adeptix";
import express from "express";

const app = express();

// IMPORTANT: verification needs the raw body, not JSON-parsed. Don't put express.json()
// (or any body parser) in front of this route.
app.post("/webhooks/adeptix", express.raw({ type: "application/json" }), (req, res) => {
  let event;
  try {
    event = parseWebhookEvent(req.body, req.header("x-adeptix-signature"), process.env.ADEPTIX_WEBHOOK_SECRET!);
  } catch {
    return res.status(401).end();
  }

  if (event.test_mode) {
    // A test-key payment - acknowledge it, but never fulfil a real order from it.
    return res.status(200).end();
  }

  if (event.event === "payment.paid") {
    // mark your order paid — event.order_ref / event.transaction_id
  } else if (event.event === "crypto_payment.matched") {
    // mark your order paid — event.order_ref / event.payment_request_id
  }

  res.status(200).end();
});
```

Handlers should be idempotent — the same event can be delivered more than once.

## Test mode

Create a **Test** key (`ak_test_...`) from the dashboard's API Keys page and pass it as `apiKey` —
nothing else in the client changes. No real payment is made and nothing touches a blockchain; the
amount you send picks the outcome:

- Merchant payments: an amount ending in `.00` is `paid` immediately (and a `payment.paid` webhook is
  sent), `.01` is `failed` (no webhook), anything else stays `pending`.
- Crypto payments: a requested amount ending in `.00` is `matched` immediately (and a
  `crypto_payment.matched` webhook is sent); anything else stays `pending` until it expires.
  `pay_to_address` is the literal string `"sandbox"`.

Test webhooks go to the same URL as live ones with `test_mode: true` — make your production handler
ignore them, as in the example above. See **https://docs.adeptix.app** for details.

## Error handling

Every non-2xx response throws `AdeptixApiError`. Always check `.code`, not `.message` (which isn't
guaranteed to be present or stable):

```ts
import { AdeptixApiError } from "adeptix";

try {
  await client.payments.create({ amount: "49.00", currency: "USD", email: "a@b.com", provider: "stripe" });
} catch (err) {
  if (err instanceof AdeptixApiError) {
    console.error(err.status, err.code, err.details);
  } else {
    throw err;
  }
}
```

See **https://docs.adeptix.app/errors** for the full list of error codes.

## Retries

`GET` requests (status checks) are automatically retried on a network error or a 5xx response, with
exponential backoff (`maxRetries`, default 2). `POST` requests are **never** auto-retried — there's
no idempotency-key mechanism on the API today, so a retried `POST` could create a second payment
request or checkout session. Configure with:

```ts
new AdeptixClient({ apiKey, maxRetries: 3, timeoutMs: 20_000 });
```

## License

MIT
