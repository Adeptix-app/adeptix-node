import { AdeptixApiError, AdeptixUnexpectedResponseError } from "./errors.js";
const DEFAULT_BASE_URL = "https://api.adeptix.app/v1";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_RETRIES = 2;
async function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
export class AdeptixClient {
    apiKey;
    baseUrl;
    timeoutMs;
    maxRetries;
    fetchImpl;
    constructor(options) {
        if (!options.apiKey)
            throw new Error("AdeptixClient requires an apiKey");
        this.apiKey = options.apiKey;
        this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
        this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
        this.fetchImpl = options.fetch ?? fetch;
    }
    crypto = {
        /** Reserve a unique, exact-amount crypto deposit. POST — never auto-retried, see maxRetries. */
        createPaymentRequest: (params, options) => this.request("POST", "/crypto/payment-requests", {
            chain: params.chain,
            token: params.token,
            amount: params.amount,
            order_ref: params.orderRef,
            customer_email: params.customerEmail,
            return_url: params.returnUrl,
            cancel_url: params.cancelUrl,
            description: params.description,
            metadata: params.metadata,
        }, options),
        /** The chain/token pairs createPaymentRequest accepts right now. */
        assets: {
            list: async () => (await this.request("GET", "/crypto/assets")).data,
        },
        /** Check the status of a previously created crypto payment request. */
        getPaymentRequest: (paymentRequestId) => this.request("GET", `/crypto/payment-requests/${encodeURIComponent(paymentRequestId)}`),
    };
    payments = {
        /** Open a hosted checkout session with a provider. POST — never auto-retried, see maxRetries. */
        create: (params, options) => this.request("POST", "/payment-links", {
            amount: params.amount,
            currency: params.currency,
            email: params.email,
            provider: params.provider,
            order_ref: params.orderRef,
            return_url: params.returnUrl,
            cancel_url: params.cancelUrl,
            description: params.description,
            metadata: params.metadata,
        }, options),
        /** Check the status of a previously created payment. */
        get: (transactionId) => this.request("GET", `/payments/${encodeURIComponent(transactionId)}`),
    };
    providers = {
        /** The providers you can pass as `provider` to payments.create() right now. */
        list: async () => (await this.request("GET", "/providers")).data,
        /** One provider; throws AdeptixApiError (code "not_found") if it isn't usable on your account. */
        get: (providerId) => this.request("GET", `/providers/${encodeURIComponent(providerId)}`),
    };
    async request(method, path, body, options) {
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
                    return (await res.json());
                }
                if (isRetryable && res.status >= 500 && attempt < this.maxRetries) {
                    attempt++;
                    await sleep(2 ** attempt * 200);
                    continue;
                }
                const text = await res.text();
                let parsed;
                try {
                    parsed = JSON.parse(text);
                }
                catch {
                    throw new AdeptixUnexpectedResponseError(res.status, text);
                }
                if (typeof parsed.error !== "string") {
                    throw new AdeptixUnexpectedResponseError(res.status, text);
                }
                throw new AdeptixApiError(res.status, parsed);
            }
            catch (err) {
                if (err instanceof AdeptixApiError || err instanceof AdeptixUnexpectedResponseError)
                    throw err;
                // Network error / timeout - retry only GETs, same backoff as a 5xx.
                if (isRetryable && attempt < this.maxRetries) {
                    attempt++;
                    await sleep(2 ** attempt * 200);
                    continue;
                }
                throw err;
            }
            finally {
                clearTimeout(timeout);
            }
        }
    }
}
