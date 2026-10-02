# adeptix

Official Node.js / TypeScript SDK for the [Adeptix API](https://docs.adeptix.app) — direct on-chain
crypto payments and hosted card/bank/wallet checkouts, from a single client.

Full API reference: **https://docs.adeptix.app**

## Install

```bash
npm install adeptix
```

> **Not on the npm registry yet.** Until it is, install straight from GitHub (npm builds it on
> install via the `prepare` script):
>
> ```bash
> npm install github:Adeptix-app/adeptix-node
> ```

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

  if (event.event === "payment.paid") {
    // mark your order paid — event.order_ref / event.transaction_id
  } else if (event.event === "crypto_payment.matched") {
    // mark your order paid — event.order_ref / event.payment_request_id
  }

  res.status(200).end();
});
```

Handlers should be idempotent — the same event can be delivered more than once.

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
