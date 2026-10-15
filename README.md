# adeptix

Official Node.js / TypeScript SDK for the [Adeptix API](https://docs.adeptix.app) — direct on-chain
crypto payments and hosted card/bank/wallet checkouts, from a single client.

Full API reference: **https://docs.adeptix.app**

## Install

Install straight from GitHub (the built package is included, so nothing runs at install time):

```bash
npm install github:Adeptix-app/adeptix-node
```

To pin a specific release instead of tracking the latest, add its tag:

```bash
npm install github:Adeptix-app/adeptix-node#v0.2.0
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

// Show request.amount and request.pay_to_address to the customer - or send them to
// request.checkout_url, a hosted payment page (amount, address, QR code, countdown, live status).
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

### Optional fields: description, return URL, cancel URL, metadata

Both create calls accept `description`, `returnUrl`, `cancelUrl` and `metadata`; they are echoed back
in responses and (`metadata`, `description`) in webhooks.

```ts
await client.crypto.createPaymentRequest({
  chain: "tron",
  token: "USDT",
  amount: "49.00",
  description: "Annual plan",
  returnUrl: "https://shop.example.com/thanks", // used by the hosted checkout page
  cancelUrl: "https://shop.example.com/cart",
  metadata: { cart_id: "c_8841" }, // up to 20 string keys / string values
});
```

> `returnUrl` / `cancelUrl` are applied on Adeptix-hosted pages (the crypto `checkout_url` page and the
> test-mode sandbox page). A customer paying by card or wallet through a live `payments.create()`
> checkout is **not** redirected back automatically - confirm the payment with the webhook or
> `payments.get()`, not by waiting for the customer to arrive at your return URL.

### Idempotency

Pass an `idempotencyKey` to a create call and a retry of that same call can never create a second
payment: the same key with the same request returns the original response (same status and body); the
same key with a different request throws `AdeptixApiError` with code `idempotency_key_reuse`; the same
key while the first request is still running throws `idempotent_request_in_progress` (HTTP 409).

```ts
import { randomUUID } from "node:crypto";

const idempotencyKey = randomUUID(); // once per logical payment - store it with your order
const payment = await client.payments.create(
  { amount: "49.00", currency: "USD", email: "customer@example.com", provider: "stripe" },
  { idempotencyKey },
);
// On a timeout, call it again with the SAME idempotencyKey.
```

Keys are 1-255 printable ASCII characters and are remembered for 24 hours. See
**https://docs.adeptix.app/idempotency**.

### Discovery

```ts
const providers = await client.providers.list(); // ids you can pass as `provider`
const stripe = await client.providers.get("stripe");
const assets = await client.crypto.assets.list(); // chain/token pairs you can request
```

## Webhooks

Prefer webhooks over polling — see **https://docs.adeptix.app/webhooks** for how to configure a
webhook URL and secret from your dashboard.

```ts
import { constructEvent } from "adeptix";
import express from "express";

const app = express();

// IMPORTANT: verification needs the raw body, not JSON-parsed. Don't put express.json()
// (or any body parser) in front of this route.
app.post("/webhooks/adeptix", express.raw({ type: "application/json" }), (req, res) => {
  let event;
  try {
    // Verifies the Adeptix-Signature header (HMAC over "<timestamp>.<raw body>") and rejects
    // timestamps more than 300 seconds off, so a captured delivery can't be replayed later.
    event = constructEvent(req.body, req.header("adeptix-signature"), process.env.ADEPTIX_WEBHOOK_SECRET!);
  } catch {
    return res.status(401).end();
  }

  if (alreadyProcessed(event.id)) return res.status(200).end(); // dedupe on the event id

  if (event.test_mode) {
    // A test-key payment - acknowledge it, but never fulfil a real order from it.
    return res.status(200).end();
  }

  switch (event.event) {
    case "payment.paid": // mark your order paid - event.order_ref / event.transaction_id
    case "crypto_payment.matched": // mark your order paid - event.order_ref / event.payment_request_id
      break;
    case "payment.failed": // a (test) card payment failed
    case "crypto_payment.expired": // a crypto request timed out unpaid
      break;
    default:
      break; // new event types can be added: acknowledge and ignore what you don't handle
  }

  markProcessed(event.id);
  res.status(200).end();
});
```

Every event has a stable `id` (identical on retries), `created` (unix seconds) and `api_version`. Handlers
should be idempotent - the same event can be delivered more than once.

`constructEvent` / `verifyWebhookSignatureV2` read the newer `Adeptix-Signature` header. The original
`parseWebhookEvent` / `verifyWebhookSignature` (which read `x-adeptix-signature`) still work unchanged
if you haven't moved over - both headers are sent on every delivery. See
**https://docs.adeptix.app/webhooks**.

## Test mode

Create a **Test** key (`ak_test_...`) from the dashboard's API Keys page and pass it as `apiKey` —
nothing else in the client changes. No real payment is made and nothing touches a blockchain; the
amount you send picks the outcome:

- Merchant payments: an amount ending in `.00` is `paid` immediately (and a `payment.paid` webhook is
  sent), `.01` is `failed` (and a `payment.failed` webhook is sent), anything else stays `pending`.
- Crypto payments: a requested amount ending in `.00` is `matched` immediately (and a
  `crypto_payment.matched` webhook is sent); anything else stays `pending` until it expires, then a
  `crypto_payment.expired` webhook is sent.
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
exponential backoff (`maxRetries`, default 2). `POST` requests are **never** auto-retried by the
client - without an idempotency key a retried `POST` could create a second payment request or checkout
session. Retry them yourself with an `idempotencyKey` (see above) and that is safe. Configure with:

```ts
new AdeptixClient({ apiKey, maxRetries: 3, timeoutMs: 20_000 });
```

## License

MIT
