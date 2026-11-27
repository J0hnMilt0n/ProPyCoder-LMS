import "server-only";
import { logger } from "@/lib/logger";

// --------------------------------------------------
// PHONEPE API URLS
// --------------------------------------------------

const PHONEPE_SANDBOX_API =
  "https://api-preprod.phonepe.com/apis/pg-sandbox";

const PHONEPE_PRODUCTION_API =
  "https://api.phonepe.com/apis/pg";

const PHONEPE_SANDBOX_AUTH =
  "https://api-preprod.phonepe.com/apis/pg-sandbox";

const PHONEPE_PRODUCTION_AUTH =
  "https://api.phonepe.com/apis/identity-manager";

// --------------------------------------------------
// TYPES
// --------------------------------------------------

type PhonePeConfig = {
  clientId: string;
  clientSecret: string;
  clientVersion: string;
  baseUrl: string;
  authUrl: string;
};

type TokenResponse = {
  access_token?: string;
  expires_at?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
};

export type PhonePeOrderStatus = {
  orderId?: string;
  state?: string;
  amount?: number;
  expireAt?: number;
  paymentDetails?: Array<{
    transactionId?: string;
    paymentMode?: string;
    state?: string;
  }>;
};

export class PhonePeApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly providerCode?: string,
    readonly providerMessage?: string,
  ) {
    super(message);
    this.name = "PhonePeApiError";
  }
}

// --------------------------------------------------
// TOKEN CACHE
// --------------------------------------------------

type CachedToken = {
  token: string;
  expiresAt: number;
};

const tokenCache = new Map<string, CachedToken>();

const tokenPromises = new Map<string, Promise<string>>();

// --------------------------------------------------
// CONFIGURATION
// --------------------------------------------------

function getConfig(): PhonePeConfig {
  const clientId = process.env.PHONEPE_CLIENT_ID;
  const clientSecret = process.env.PHONEPE_CLIENT_SECRET;
  const clientVersion = process.env.PHONEPE_CLIENT_VERSION;

  if (!clientId || !clientSecret || !clientVersion) {
    throw new Error(
      "PhonePe credentials are not configured",
    );
  }

  const environment =
    process.env.PHONEPE_ENVIRONMENT ?? "SANDBOX";

  if (
    environment !== "SANDBOX" &&
    environment !== "PRODUCTION"
  ) {
    throw new Error(
      "PHONEPE_ENVIRONMENT must be SANDBOX or PRODUCTION",
    );
  }

  const production = environment === "PRODUCTION";

  return {
    clientId,
    clientSecret,
    clientVersion,

    baseUrl: production
      ? PHONEPE_PRODUCTION_API
      : PHONEPE_SANDBOX_API,

    authUrl: production
      ? PHONEPE_PRODUCTION_AUTH
      : PHONEPE_SANDBOX_AUTH,
  };
}

// --------------------------------------------------
// ACCESS TOKEN
// --------------------------------------------------

async function getAccessToken(
  config: PhonePeConfig,
): Promise<string> {
  const cacheKey = [
    config.authUrl,
    config.baseUrl,
    config.clientId,
    config.clientVersion,
    config.clientSecret,
  ].join(":");

  // Return cached token if valid.
  const cached = tokenCache.get(cacheKey);

  if (
    cached &&
    cached.expiresAt > Date.now() + 120_000
  ) {
    return cached.token;
  }

  // Prevent duplicate token requests.
  const existingPromise = tokenPromises.get(cacheKey);

  if (existingPromise) {
    return existingPromise;
  }

  const promise = (async () => {
    const start = performance.now();

    try {
      const body = new URLSearchParams({
        client_id: config.clientId,
        client_version: config.clientVersion,
        client_secret: config.clientSecret,
        grant_type: "client_credentials",
      });

      const response = await fetch(
        `${config.authUrl}/v1/oauth/token`,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
          },

          body,
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        },
      );

      const rawBody = await response.text();

      let data: TokenResponse;

      try {
        data = JSON.parse(rawBody) as TokenResponse;
      } catch {
        logger.error(
          "[PhonePe] Invalid authorization response",
          {
            metadata: {
              status: response.status,
              responseBody: rawBody.slice(0, 1000),
            },
          },
        );

        throw new Error(
          "PhonePe returned an invalid authorization response",
        );
      }

      if (!response.ok) {
        logger.error(
          "[PhonePe] Authorization failed",
          {
            metadata: {
              status: response.status,
              error: data,
            },
          },
        );

        throw new PhonePeApiError(
          `PhonePe authorization failed (${response.status})`,
          response.status,
          data.error,
          data.error_description,
        );
      }

      if (!data.access_token) {
        throw new Error(
          "PhonePe returned no access token",
        );
      }

      const expiresAt =
        typeof data.expires_at === "number"
          ? data.expires_at * 1000
          : Date.now() + 30 * 60 * 1000;

      tokenCache.set(cacheKey, {
        token: data.access_token,
        expiresAt,
      });

      console.info(
        `[PhonePe] Token request completed in ${Math.round(
          performance.now() - start,
        )}ms`,
      );

      return data.access_token;
    } finally {
      tokenPromises.delete(cacheKey);
    }
  })();

  tokenPromises.set(cacheKey, promise);

  return promise;
}

// --------------------------------------------------
// GENERIC PHONEPE REQUEST
// --------------------------------------------------

async function phonePeRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const totalStart = performance.now();

  const config = getConfig();

  // Get access token.
  const tokenStart = performance.now();

  const token = await getAccessToken(config);

  console.info(
    `[PhonePe] Token duration: ${Math.round(
      performance.now() - tokenStart,
    )}ms`,
  );

  // Make API request.
  const apiStart = performance.now();

  let response: Response;

  try {
    response = await fetch(
      `${config.baseUrl}${path}`,
      {
        ...init,

        headers: {
          Authorization: `O-Bearer ${token}`,

          ...(init.body
            ? {
                "Content-Type": "application/json",
              }
            : {}),

          ...init.headers,
        },

        cache: "no-store",

        signal:
          init.signal ?? AbortSignal.timeout(10_000),
      },
    );
  } catch (error) {
    logger.error(
      "[PhonePe] Network error",
      {
        cause:
          error instanceof Error
            ? error
            : undefined,

        metadata: {
          error: String(error),
        },
      },
    );

    throw error;
  }

  console.info(
    `[PhonePe] API duration: ${Math.round(
      performance.now() - apiStart,
    )}ms`,
  );

  // Read response once.
  const rawBody = await response.text();

  let result: unknown = null;

  if (rawBody) {
    try {
      result = JSON.parse(rawBody);
    } catch {
      result = rawBody;
    }
  }

  // Handle HTTP errors.
  if (!response.ok) {
    const errorBody =
      result && typeof result === "object"
        ? (result as {
            code?: unknown;
            message?: unknown;
            data?: {
              message?: unknown;
            };
          })
        : null;

    const providerCode =
      typeof errorBody?.code === "string"
        ? errorBody.code
        : undefined;

    const providerMessage =
      typeof errorBody?.message === "string"
        ? errorBody.message
        : typeof errorBody?.data?.message === "string"
          ? errorBody.data.message
          : typeof result === "string"
            ? result.slice(0, 500)
            : undefined;

    logger.error(
      "[PhonePe] API error",
      {
        metadata: {
          status: response.status,
          providerCode,
          providerMessage,
        },
      },
    );

    throw new PhonePeApiError(
      `PhonePe request failed (${response.status})${
        providerCode ? ` ${providerCode}` : ""
      }${
        providerMessage
          ? `: ${providerMessage}`
          : ""
      }`,
      response.status,
      providerCode,
      providerMessage,
    );
  }

  if (typeof result !== "object" || result === null) {
    throw new Error(
      "PhonePe returned an invalid API response",
    );
  }

  console.info(
    `[PhonePe] Total request duration: ${Math.round(
      performance.now() - totalStart,
    )}ms`,
  );

  return result as T;
}

// --------------------------------------------------
// CREATE PAYMENT ORDER
// --------------------------------------------------

export async function createPhonePeOrder(input: {
  paymentId: string;
  amountRupees: number;
  redirectUrl: string;
  productName?: string;
}): Promise<{ redirectUrl: string }> {
  const start = performance.now();

  // Convert rupees into paise.
  const amount = Math.round(
    input.amountRupees * 100,
  );

  if (
    !Number.isSafeInteger(amount) ||
    amount < 100
  ) {
    throw new Error(
      "PhonePe requires an amount of at least ₹1.00",
    );
  }

  // Validate merchant order ID.
  if (
    !/^[A-Za-z0-9_-]{1,63}$/.test(input.paymentId)
  ) {
    throw new Error(
      "Payment ID is not valid as a PhonePe merchantOrderId",
    );
  }

  // Validate redirect URL.
  const redirect = new URL(input.redirectUrl);

  if (
    redirect.protocol !== "https:" &&
    redirect.hostname !== "localhost"
  ) {
    throw new Error(
      "PhonePe redirect URL must use HTTPS outside localhost",
    );
  }

  console.info(
    "[PhonePe] Creating payment:",
    {
      orderId: input.paymentId,
      amount,
    },
  );

  const result = await phonePeRequest<{
    orderId?: string;
    state?: string;
    redirectUrl?: string;
  }>("/checkout/v2/pay", {
    method: "POST",

    body: JSON.stringify({
      merchantOrderId: input.paymentId,
      amount,

      expireAfter: 1200,

      paymentFlow: {
        type: "PG_CHECKOUT",

        // PhonePe documents this as the message used for collect requests.
        // Pass the actual course/bundle name from the payment route.
        message: input.productName?.trim()
          ? `Payment for ${input.productName.trim()}`
          : "ProPyCoder course purchase",

        merchantUrls: {
          redirectUrl: input.redirectUrl,
        },
      },
    }),
  });

  if (!result.redirectUrl) {
    throw new Error(
      "PhonePe returned no checkout URL",
    );
  }

  console.info(
    `[PhonePe] Payment created in ${Math.round(
      performance.now() - start,
    )}ms`,
  );

  return {
    redirectUrl: result.redirectUrl,
  };
}

// --------------------------------------------------
// CHECK ORDER STATUS
// --------------------------------------------------

export async function getPhonePeOrderStatus(
  merchantOrderId: string,
): Promise<PhonePeOrderStatus> {
  if (!merchantOrderId) {
    throw new Error(
      "Merchant order ID is required",
    );
  }

  return phonePeRequest<PhonePeOrderStatus>(
    `/checkout/v2/order/${encodeURIComponent(
      merchantOrderId,
    )}/status`,
  );
}
