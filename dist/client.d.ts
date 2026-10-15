import type { CreateCryptoPaymentRequestParams, CryptoAsset, CryptoPaymentRequest, CryptoPaymentRequestStatus, CreatePaymentParams, Payment, PaymentStatus, Provider, RequestOptions } from "./types.ts";
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
export declare class AdeptixClient {
    private readonly apiKey;
    private readonly baseUrl;
    private readonly timeoutMs;
    private readonly maxRetries;
    private readonly fetchImpl;
    constructor(options: AdeptixClientOptions);
    readonly crypto: {
        /** Reserve a unique, exact-amount crypto deposit. POST — never auto-retried, see maxRetries. */
        createPaymentRequest: (params: CreateCryptoPaymentRequestParams, options?: RequestOptions) => Promise<CryptoPaymentRequest>;
        /** The chain/token pairs createPaymentRequest accepts right now. */
        assets: {
            list: () => Promise<CryptoAsset[]>;
        };
        /** Check the status of a previously created crypto payment request. */
        getPaymentRequest: (paymentRequestId: string) => Promise<CryptoPaymentRequestStatus>;
    };
    readonly payments: {
        /** Open a hosted checkout session with a provider. POST — never auto-retried, see maxRetries. */
        create: (params: CreatePaymentParams, options?: RequestOptions) => Promise<Payment>;
        /** Check the status of a previously created payment. */
        get: (transactionId: string) => Promise<PaymentStatus>;
    };
    readonly providers: {
        /** The providers you can pass as `provider` to payments.create() right now. */
        list: () => Promise<Provider[]>;
        /** One provider; throws AdeptixApiError (code "not_found") if it isn't usable on your account. */
        get: (providerId: string) => Promise<Provider>;
    };
    private request;
}
