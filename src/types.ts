export type CryptoChain = "bsc" | "polygon" | "tron";
export type CryptoToken = "USDT" | "USDC";
export type CryptoPaymentStatus = "pending" | "matched" | "expired";
export type MerchantPaymentStatus = "pending" | "paid" | "failed" | "expired";

/** Optional fields accepted when creating either kind of payment. */
export interface CheckoutFields {
  /**
   * Where you intend the customer to land after paying. Absolute https URL (http only for localhost
   * with a test key), up to 2048 characters, no credentials. For a crypto payment it is used by the
   * hosted checkout page; a live card/wallet payer is NOT redirected to it automatically - rely on
   * the webhook or the status API to learn the outcome.
   */
  returnUrl?: string;
  /** Where you intend the customer to land if they abandon checkout. Same rules as returnUrl. */
  cancelUrl?: string;
  /** A short description, up to 500 characters. Shown on the hosted crypto checkout; echoed back. */
  description?: string;
  /** Your own data: up to 20 string keys (A-Z a-z 0-9 _ . -, max 40 chars) with string values (max 500 chars). */
  metadata?: Record<string, string>;
}

/** Per-call options for the two POST creation methods. */
export interface RequestOptions {
  /**
   * Makes the POST safe to retry: the same key with the same request returns the original response
   * (carried out at most once) instead of creating a second payment. 1-255 printable ASCII
   * characters. Generate it once per logical payment and reuse it for retries. See
   * https://docs.adeptix.app/idempotency
   */
  idempotencyKey?: string;
}

/** The echoed-back optional fields present on every create and status response. */
export interface CheckoutFieldsResponse {
  return_url: string | null;
  cancel_url: string | null;
  metadata: Record<string, string> | null;
  description: string | null;
}

export interface CreateCryptoPaymentRequestParams extends CheckoutFields {
  /** One of "bsc", "polygon", "tron". */
  chain: CryptoChain;
  /** One of "USDT", "USDC". */
  token: CryptoToken;
  /** The amount you want to receive, as a plain decimal string, e.g. "49.00". Not a number. */
  amount: string;
  /** Your own order/invoice identifier, echoed back in the status response and webhook payload. */
  orderRef?: string;
  /** The customer's email, stored for your own records. */
  customerEmail?: string;
}

export interface CryptoPaymentRequest extends CheckoutFieldsResponse {
  payment_request_id: string;
  chain: CryptoChain;
  token: CryptoToken;
  /** The on-chain address to send the deposit to. Shared across requests — amount is what identifies this one. */
  pay_to_address: string;
  /** The exact amount the customer must send. May differ slightly from the amount requested. */
  amount: string;
  /** ISO 8601 timestamp — the request stops being matchable after this time. */
  expires_at: string;
  /** A hosted, no-login payment page for this request - send the customer here, or ignore it. */
  checkout_url: string;
  order_ref: string | null;
}

export interface CryptoPaymentRequestStatus extends CheckoutFieldsResponse {
  payment_request_id: string;
  status: CryptoPaymentStatus;
  order_ref: string | null;
  requested_amount: string;
  quoted_amount: string;
  created_at: string;
  expires_at: string;
  checkout_url: string;
}

export interface CreatePaymentParams extends CheckoutFields {
  /** The amount to charge, as a plain decimal string, e.g. "49.00". Not a number. */
  amount: string;
  /** A 3-letter ISO currency code, e.g. "USD". */
  currency: string;
  /** The customer's email address. */
  email: string;
  /** The id of an enabled provider on your account, e.g. "stripe". */
  provider: string;
  /** Your own order/invoice identifier, echoed back in the status response and webhook payload. */
  orderRef?: string;
}

export interface Payment extends CheckoutFieldsResponse {
  transaction_id: string;
  /** A hosted checkout URL. Treat it as opaque — redirect the customer's browser here. */
  payment_url: string;
  order_ref: string | null;
}

export interface PaymentStatus extends CheckoutFieldsResponse {
  transaction_id: string;
  status: MerchantPaymentStatus;
  order_ref: string | null;
  currency: string;
  amount: string;
  provider_id: string;
  asset: string | null;
  value_coin: string | null;
  txid_out: string | null;
  created_at: string;
  paid_at: string | null;
}

/** Fields present on every webhook event since the 2026-10-15 format. */
export interface WebhookEnvelope {
  /** "evt_..." - unique per event and identical on every retry of it. Deduplicate on this. */
  id: string;
  /** When the event was created, unix seconds (stable across retries). */
  created: number;
  /** The event format version, "2026-10-15". */
  api_version: string;
  metadata: Record<string, string> | null;
  description: string | null;
}

export interface WebhookPaymentPaidEvent extends WebhookEnvelope {
  event: "payment.paid";
  transaction_id: string;
  order_ref: string | null;
  status: MerchantPaymentStatus;
  currency: string;
  amount: string;
  asset: string | null;
  value_coin: string | null;
  txid_out: string | null;
  paid_at: string | null;
  /**
   * true if the payment was created with a test key (ak_test_...). Test and live events go to the
   * same webhook URL — never fulfil a real order from an event where this is true.
   */
  test_mode: boolean;
}

/** Same shape as payment.paid with status "failed" and null settlement fields. */
export interface WebhookPaymentFailedEvent extends Omit<WebhookPaymentPaidEvent, "event"> {
  event: "payment.failed";
}

export interface WebhookCryptoPaymentMatchedEvent extends WebhookEnvelope {
  event: "crypto_payment.matched";
  payment_request_id: string;
  order_ref: string | null;
  status: CryptoPaymentStatus;
  asset_id: string;
  quoted_amount: string;
  amount: string;
  /** Starts with "sandbox_" for a test-mode match — not a real transaction hash. */
  tx_hash: string;
  /**
   * true if the payment was created with a test key (ak_test_...). Test and live events go to the
   * same webhook URL — never fulfil a real order from an event where this is true.
   */
  test_mode: boolean;
}

/** Sent once when a pending crypto request passes expires_at with no matching deposit. Nothing was credited. */
export interface WebhookCryptoPaymentExpiredEvent extends WebhookEnvelope {
  event: "crypto_payment.expired";
  payment_request_id: string;
  order_ref: string | null;
  status: CryptoPaymentStatus;
  asset_id: string;
  quoted_amount: string;
  /** ISO 8601 */
  expires_at: string;
  test_mode: boolean;
}

/**
 * Every event type this SDK version knows. New types can be added by the API at any time: always
 * branch on `event` and acknowledge (2xx) events you don't handle.
 */
export type WebhookEvent =
  | WebhookPaymentPaidEvent
  | WebhookPaymentFailedEvent
  | WebhookCryptoPaymentMatchedEvent
  | WebhookCryptoPaymentExpiredEvent;

export interface ProviderCountries {
  /** "confirmed": a real list of served countries; "broad": wide coverage, illustrative codes only; "unconfirmed": partial/empty. */
  scope: "confirmed" | "broad" | "unconfirmed";
  /** ISO 3166-1 alpha-2 codes. */
  codes: string[];
}

/** A provider usable as `provider` in payments.create(), from providers.list() / providers.get(). */
export interface Provider {
  /** Pass this as `provider` when creating a payment. */
  id: string;
  name: string;
  /** A decimal string in minimum_currency, or null if unknown. */
  minimum_amount: string | null;
  minimum_currency: string | null;
  /** Human-readable summary; null means "not confirmed", not "none". */
  payment_methods: string | null;
  countries: ProviderCountries | null;
  /** "degraded" = currently reported unstable; still usable. */
  status: "active" | "degraded";
}

/** A chain/token pair accepted by crypto.createPaymentRequest(), from crypto.assets.list(). */
export interface CryptoAsset {
  /** "<chain>_<token lower case>", e.g. "polygon_usdc". */
  id: string;
  chain: CryptoChain;
  token: CryptoToken;
  decimals: number;
  /** Deposits below this decimal-string amount are not credited. */
  min_amount: string;
  /** The platform's default commission as a fraction (0.005 = 0.5%). */
  commission_rate_default: number;
}

export interface ListResponse<T> {
  data: T[];
}
