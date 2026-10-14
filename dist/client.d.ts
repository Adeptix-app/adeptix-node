import type { CreateCryptoPaymentRequestParams, CryptoPaymentRequest, CryptoPaymentRequestStatus, CreatePaymentParams, Payment, PaymentStatus } from "./types.ts";
export interface AdeptixClientOptions {
    /** Your API key from the dashboard's API Keys page, e.g. "ak_live_...". */
    apiKey: string;
    /** Override the API base URL. Defaults to the production API — you shouldn't normally need this. */
    baseUrl?: string;
    /** Abort a request after this many milliseconds. Defaults to 15000. */
    timeoutMs?: number;
    /**
     * How many times to retry a GET request on a network error or a 5xx response, with exponential
     * backoff. Defaults to 2. POST requests are never auto-retried — there's no idempotency-key
     * mechanism on the API today, so a retried POST could create a second payment request or
     * checkout session. Retry those yourself only when you're sure the first attempt never reached
     * the server (e.g. it threw before any response at all).
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
        createPaymentRequest: (params: CreateCryptoPaymentRequestParams) => Promise<CryptoPaymentRequest>;
        /** Check the status of a previously created crypto payment request. */
        getPaymentRequest: (paymentRequestId: string) => Promise<CryptoPaymentRequestStatus>;
    };
    readonly payments: {
        /** Open a hosted checkout session with a provider. POST — never auto-retried, see maxRetries. */
        create: (params: CreatePaymentParams) => Promise<Payment>;
        /** Check the status of a previously created payment. */
        get: (transactionId: string) => Promise<PaymentStatus>;
    };
    private request;
}
