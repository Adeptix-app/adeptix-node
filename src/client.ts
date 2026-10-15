import { AdeptixApiError, AdeptixUnexpectedResponseError, type AdeptixErrorBody } from "./errors.ts";
import type {
  CreateCryptoPaymentRequestParams,
  CryptoAsset,
  CryptoPaymentRequest,
  CryptoPaymentRequestStatus,
  CreatePaymentParams,
  ListResponse,
  Payment,
  PaymentStatus,
  Provider,
  RequestOptions,
} from "./types.ts";

export interface AdeptixClientOptions {
  /** Your API key from the dashboard's API Keys page, e.g. "ak_live_...". */
  apiKey: string;
  /** Override the API base URL. Defaults to the production API — you shouldn't normally need this. */
  baseUrl?: string;
  /** Abort a request after this many milliseconds. Defaults to 15000. */
  timeoutMs?: number;
  /**
   * How many times to retry a GET request on a network error or a 5xx response, with exponential
   * backoff. Defaults to 2. POST requests are never auto-retried by the client — without an
   * idempotency key a retried POST could create a second payment request or checkout session.
   * Pass `{ idempotencyKey }` to a create call and you can retry it yourself safely: the same key
   * with the same request returns the original response instead of creating a duplicate.
   */
  maxRetries?: number;
  /** Inject a custom fetch implementation — mainly for tests. Defaults to the global fetch. */
  fetch?: typeof fetch;
}

const DEFAULT_BASE_URL = "https://api.adeptix.app/v1";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 2;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class AdeptixClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AdeptixClientOptions) {
    if (!options.apiKey) throw new Error("AdeptixClient requires an apiKey");
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.fetchImpl = options.fetch ?? fetch;
  }

  readonly crypto = {
    /** Reserve a unique, exact-amount crypto deposit. POST — never auto-retried, see maxRetries. */
    createPaymentRequest: (
      params: CreateCryptoPaymentRequestParams,
      options?: RequestOptions,
    ): Promise<CryptoPaymentRequest> =>
      this.request(
        "POST",
        "/crypto/payment-requests",
        {
          chain: params.chain,
          token: params.token,
          amount: params.amount,
          order_ref: params.orderRef,
          customer_email: params.customerEmail,
          return_url: params.returnUrl,
          cancel_url: params.cancelUrl,
          description: params.description,
          metadata: params.metadata,
        },
        options,
      ),

    /** The chain/token pairs createPaymentRequest accepts right now. */
    assets: {
      list: async (): Promise<CryptoAsset[]> => (await this.request<ListResponse<CryptoAsset>>("GET", "/crypto/assets")).data,
    },

    /** Check the status of a previously created crypto payment request. */
    getPaymentRequest: (paymentRequestId: string): Promise<CryptoPaymentRequestStatus> =>
      this.request("GET", `/crypto/payment-requests/${encodeURIComponent(paymentRequestId)}`),
  };

  readonly payments = {
    /** Open a hosted checkout session with a provider. POST — never auto-retried, see maxRetries. */
    create: (params: CreatePaymentParams, options?: RequestOptions): Promise<Payment> =>
      this.request(
        "POST",
        "/payment-links",
        {
          amount: params.amount,
          currency: params.currency,
          email: params.email,
          provider: params.provider,
          order_ref: params.orderRef,
          return_url: params.returnUrl,
          cancel_url: params.cancelUrl,
          description: params.description,
          metadata: params.metadata,
        },
        options,
      ),

    /** Check the status of a previously created payment. */
    get: (transactionId: string): Promise<PaymentStatus> =>
      this.request("GET", `/payments/${encodeURIComponent(transactionId)}`),
  };

  readonly providers = {
    /** The providers you can pass as `provider` to payments.create() right now. */
    list: async (): Promise<Provider[]> => (await this.request<ListResponse<Provider>>("GET", "/providers")).data,

    /** One provider; throws AdeptixApiError (code "not_found") if it isn't usable on your account. */
    get: (providerId: string): Promise<Provider> => this.request("GET", `/providers/${encodeURIComponent(providerId)}`),
  };

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown, options?: RequestOptions): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const isRetryable = method === "GET";
    let attempt = 0;

    for (;;) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const res = await this.fetchImpl(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
            ...(options?.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        if (res.ok) {
          return (await res.json()) as T;
        }

        if (isRetryable && res.status >= 500 && attempt < this.maxRetries) {
          attempt++;
          await sleep(2 ** attempt * 200);
          continue;
        }

        const text = await res.text();
        let parsed: AdeptixErrorBody;
        try {
          parsed = JSON.parse(text) as AdeptixErrorBody;
        } catch {
          throw new AdeptixUnexpectedResponseError(res.status, text);
        }
        if (typeof parsed.error !== "string") {
          throw new AdeptixUnexpectedResponseError(res.status, text);
        }
        throw new AdeptixApiError(res.status, parsed);
      } catch (err) {
        if (err instanceof AdeptixApiError || err instanceof AdeptixUnexpectedResponseError) throw err;
        // Network error / timeout - retry only GETs, same backoff as a 5xx.
        if (isRetryable && attempt < this.maxRetries) {
          attempt++;
          await sleep(2 ** attempt * 200);
          continue;
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }
    }
  }
}
