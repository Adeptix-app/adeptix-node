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
        createPaymentRequest: (params) => this.request("POST", "/crypto/payment-requests", {
            chain: params.chain,
            token: params.token,
            amount: params.amount,
            order_ref: params.orderRef,
            customer_email: params.customerEmail,
        }),
        /** Check the status of a previously created crypto payment request. */
        getPaymentRequest: (paymentRequestId) => this.request("GET", `/crypto/payment-requests/${encodeURIComponent(paymentRequestId)}`),
    };
    payments = {
        /** Open a hosted checkout session with a provider. POST — never auto-retried, see maxRetries. */
        create: (params) => this.request("POST", "/payment-links", {
            amount: params.amount,
            currency: params.currency,
            email: params.email,
            provider: params.provider,
            order_ref: params.orderRef,
        }),
        /** Check the status of a previously created payment. */
        get: (transactionId) => this.request("GET", `/payments/${encodeURIComponent(transactionId)}`),
    };
    async request(method, path, body) {
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
