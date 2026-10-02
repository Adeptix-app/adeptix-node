export type CryptoChain = "bsc" | "polygon" | "tron";
export type CryptoToken = "USDT" | "USDC";
export type CryptoPaymentStatus = "pending" | "matched" | "expired";
export type MerchantPaymentStatus = "pending" | "paid" | "failed" | "expired";

export interface CreateCryptoPaymentRequestParams {
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

export interface CryptoPaymentRequest {
  payment_request_id: string;
  chain: CryptoChain;
  token: CryptoToken;
  /** The on-chain address to send the deposit to. Shared across requests — amount is what identifies this one. */
  pay_to_address: string;
  /** The exact amount the customer must send. May differ slightly from the amount requested. */
  amount: string;
  /** ISO 8601 timestamp — the request stops being matchable after this time. */
  expires_at: string;
}

export interface CryptoPaymentRequestStatus {
  payment_request_id: string;
  status: CryptoPaymentStatus;
  order_ref: string | null;
  requested_amount: string;
  quoted_amount: string;
  created_at: string;
  expires_at: string;
}

export interface CreatePaymentParams {
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

export interface Payment {
  transaction_id: string;
  /** A hosted checkout URL. Treat it as opaque — redirect the customer's browser here. */
  payment_url: string;
}

export interface PaymentStatus {
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

export interface WebhookPaymentPaidEvent {
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
}

export interface WebhookCryptoPaymentMatchedEvent {
  event: "crypto_payment.matched";
  payment_request_id: string;
  order_ref: string | null;
  status: CryptoPaymentStatus;
  asset_id: string;
  quoted_amount: string;
  amount: string;
  tx_hash: string;
}

export type WebhookEvent = WebhookPaymentPaidEvent | WebhookCryptoPaymentMatchedEvent;
