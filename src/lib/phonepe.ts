
import "server-only";

const PHONEPE_SANDBOX =
  "https://api-preprod.phonepe.com/apis/pg-sandbox";

const PHONEPE_PRODUCTION =
  "https://api.phonepe.com/apis/pg";

type PhonePeConfig = {
  clientId: string;
  clientSecret: string;
  clientVersion: string;
  baseUrl: string;
};

type TokenResponse = {
  access_token?: string;
  expires_at?: number;
};

export type PhonePeOrderStatus = {
  orderId?: string;
  state?: string;
  amount?: number;
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
  cacheKey: string;
};

let tokenCache: CachedToken | null = null;
let tokenPromise: Promise<string> | null = null;

// --------------------------------------------------
// CONFIGURATION
// --------------------------------------------------

function getConfig(): PhonePeConfig {
  const clientId = process.env.PHONEPE_CLIENT_ID;
  const clientSecret = process.env.PHONEPE_CLIENT_SECRET;
  const clientVersion = process.env.PHONEPE_CLIENT_VERSION;

  if (!clientId || !clientSecret || !clientVersion) {
    throw new Error("PhonePe credentials are not configured");
  }

  const environment =
    process.env.PHONEPE_ENVIRONMENT ?? "SANDBOX";

  if (
    environment !== "SANDBOX" &&
    environment !== "PRODUCTION"
  ) {
    throw new Error(
      "PHONEPE_ENVIRONMENT must be SANDBOX or PRODUCTION"
    );
  }

  return {
    clientId,
    clientSecret,
    clientVersion,
    baseUrl:
      environment === "PRODUCTION"
        ? PHONEPE_PRODUCTION
        : PHONEPE_SANDBOX,
  };
}

// --------------------------------------------------
// ACCESS TOKEN
// --------------------------------------------------

async function getAccessToken(
  config: PhonePeConfig
): Promise<string> {
  const cacheKey =
    `${config.baseUrl}:${config.clientId}:${config.clientVersion}`;

  // Return cached token if still valid.
  if (
    tokenCache &&
    tokenCache.cacheKey === cacheKey &&
    tokenCache.expiresAt > Date.now() + 120_000
  ) {
    return tokenCache.token;
  }

  // Prevent duplicate token requests.
  if (tokenPromise) {
    return tokenPromise;
  }

  tokenPromise = (async () => {
    const start = performance.now();

    try {
      const body = new URLSearchParams({
        client_id: config.clientId,
        client_version: config.clientVersion,
        client_secret: config.clientSecret,
        grant_type: "client_credentials",
      });

      const response = await fetch(
        `${config.baseUrl}/v1/oauth/token`,
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/x-www-form-urlencoded",
          },
          body,
          cache: "no-store",
          signal: AbortSignal.timeout(10_000),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();

        console.error(
          "[PhonePe] Authorization failed:",
          response.status,
          errorText
        );

        throw new Error(
          `PhonePe authorization failed (${response.status})`
        );
      }

      const data =
        (await response.json()) as TokenResponse;

      if (!data.access_token) {
        throw new Error(
          "PhonePe returned no access token"
        );
      }

      const expiresAt =
        typeof data.expires_at === "number"
          ? data.expires_at * 1000
          : Date.now() + 30 * 60 * 1000;

      tokenCache = {
        token: data.access_token,
        expiresAt,
        cacheKey,
      };

      console.info(
        `[PhonePe] Token request completed in ${
          Math.round(performance.now() - start)
        }ms`
      );

      return data.access_token;
    } finally {
      tokenPromise = null;
    }
  })();

  return tokenPromise;
}

// --------------------------------------------------
// GENERIC PHONEPE REQUEST
// --------------------------------------------------

async function phonePeRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const totalStart = performance.now();

  const config = getConfig();

  // Get access token.
  const tokenStart = performance.now();

  const token = await getAccessToken(config);

  console.info(
    `[PhonePe] Token duration: ${
      Math.round(performance.now() - tokenStart)
    }ms`
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
            ? { "Content-Type": "application/json" }
            : {}),
          ...init.headers,
        },
        cache: "no-store",
        signal:
          init.signal ?? AbortSignal.timeout(10_000),
      }
    );
  } catch (error) {
    console.error(
      "[PhonePe] Network error:",
      error
    );
    throw error;
  }

  console.info(
    `[PhonePe] API duration: ${
      Math.round(performance.now() - apiStart)
    }ms`
  );

  // Handle errors.
  if (!response.ok) {
    const errorBody = await response
      .json()
      .catch(() => null) as
      | {
          code?: unknown;
          message?: unknown;
          data?: {
            message?: unknown;
          };
        }
      | null;

    const providerCode =
      typeof errorBody?.code === "string"
        ? errorBody.code
        : undefined;

    const providerMessage =
      typeof errorBody?.message === "string"
        ? errorBody.message
        : typeof errorBody?.data?.message === "string"
          ? errorBody.data.message
          : undefined;

    console.error("[PhonePe] API error:", {
      status: response.status,
      providerCode,
      providerMessage,
    });

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
      providerMessage
    );
  }

  const result = (await response.json()) as T;

  console.info(
    `[PhonePe] Total request duration: ${
      Math.round(performance.now() - totalStart)
    }ms`
  );

  return result;
}

// --------------------------------------------------
// CREATE PAYMENT ORDER
// --------------------------------------------------

export async function createPhonePeOrder(input: {
  paymentId: string;
  amountRupees: number;
  redirectUrl: string;
}): Promise<{ redirectUrl: string }> {
  const start = performance.now();

  // Convert rupees to paise.
  const amount = Math.round(
    input.amountRupees * 100
  );

  if (
    !Number.isSafeInteger(amount) ||
    amount < 100
  ) {
    throw new Error(
      "PhonePe requires an amount of at least ₹1.00"
    );
  }

  // Validate merchant order ID.
  if (
    !/^[A-Za-z0-9_-]{1,63}$/.test(input.paymentId)
  ) {
    throw new Error(
      "Payment ID is not valid as a PhonePe merchantOrderId"
    );
  }

  // Validate redirect URL.
  const redirect = new URL(input.redirectUrl);

  if (
    redirect.protocol !== "https:" &&
    redirect.hostname !== "localhost"
  ) {
    throw new Error(
      "PhonePe redirect URL must use HTTPS outside localhost"
    );
  }

  console.info("[PhonePe] Creating payment:", {
    orderId: input.paymentId,
    amount,
  });

  const result = await phonePeRequest<{
    redirectUrl?: string;
  }>("/checkout/v2/pay", {
    method: "POST",
    body: JSON.stringify({
      merchantOrderId: input.paymentId,
      amount,
      expireAfter: 1200,
      paymentFlow: {
        type: "PG_CHECKOUT",
        message: "ProPyCoder course purchase",
        merchantUrls: {
          redirectUrl: input.redirectUrl,
        },
      },
    }),
  });

  if (!result.redirectUrl) {
    throw new Error(
      "PhonePe returned no checkout URL"
    );
  }

  console.info(
    `[PhonePe] Payment created in ${
      Math.round(performance.now() - start)
    }ms`
  );

  return {
    redirectUrl: result.redirectUrl,
  };
}

// --------------------------------------------------
// CHECK ORDER STATUS
// --------------------------------------------------

export async function getPhonePeOrderStatus(
  merchantOrderId: string
): Promise<PhonePeOrderStatus> {
  if (!merchantOrderId) {
    throw new Error("Merchant order ID is required");
  }

  return phonePeRequest<PhonePeOrderStatus>(
    `/checkout/v2/order/${encodeURIComponent(
      merchantOrderId
    )}/status`
  );
}
