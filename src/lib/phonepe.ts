import "server-only";


const PHONEPE_SANDBOX = "https://api-preprod.phonepe.com/apis/pg-sandbox";
const PHONEPE_PRODUCTION = "https://api.phonepe.com/apis/pg";

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

let tokenCache: { token: string; expiresAt: number } | null = null;

function getConfig(): PhonePeConfig {
  const clientId = process.env.PHONEPE_CLIENT_ID;
  const clientSecret = process.env.PHONEPE_CLIENT_SECRET;
  const clientVersion = process.env.PHONEPE_CLIENT_VERSION;

  if (!clientId || !clientSecret || !clientVersion) {
    throw new Error("PhonePe credentials are not configured");
  }

  const environment = process.env.PHONEPE_ENVIRONMENT ?? "SANDBOX";
  if (environment !== "SANDBOX" && environment !== "PRODUCTION") {
    throw new Error("PHONEPE_ENVIRONMENT must be SANDBOX or PRODUCTION");
  }

  return {
    clientId,
    clientSecret,
    clientVersion,
    baseUrl: environment === "PRODUCTION" ? PHONEPE_PRODUCTION : PHONEPE_SANDBOX,
  };
}

async function getAccessToken(config: PhonePeConfig): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }

  const body = new URLSearchParams({
    client_id: config.clientId,
    client_version: config.clientVersion,
    client_secret: config.clientSecret,
    grant_type: "client_credentials",
  });
  const response = await fetch(`${config.baseUrl}/v1/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("PhonePe authorization failed");

  const data = (await response.json()) as TokenResponse;
  if (!data.access_token) throw new Error("PhonePe returned no access token");

  tokenCache = {
    token: data.access_token,
    expiresAt: typeof data.expires_at === "number"
      ? data.expires_at * 1000
      : Date.now() + 30 * 60 * 1000,
  };
  return data.access_token;
}

async function phonePeRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = getConfig();
  const token = await getAccessToken(config);
  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `O-Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    // Do not include provider response bodies in logs/responses: they can carry
    // sensitive payment or account metadata.
    throw new Error(`PhonePe request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export async function createPhonePeOrder(input: {
  paymentId: string;
  amountRupees: number;
  redirectUrl: string;
}): Promise<{ redirectUrl: string }> {
  const amount = Math.round(input.amountRupees * 100);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("Payment amount must be a positive number of paise");
  }

  const result = await phonePeRequest<{ redirectUrl?: string }>("/checkout/v2/pay", {
    method: "POST",
    body: JSON.stringify({
      merchantOrderId: input.paymentId,
      amount,
      expireAfter: 1200,
      paymentFlow: {
        type: "PG_CHECKOUT",
        merchantUrls: { redirectUrl: input.redirectUrl },
      },
    }),
  });

  if (!result.redirectUrl) throw new Error("PhonePe returned no checkout URL");
  return { redirectUrl: result.redirectUrl };
}

export async function getPhonePeOrderStatus(
  merchantOrderId: string,
): Promise<PhonePeOrderStatus> {
  return phonePeRequest<PhonePeOrderStatus>(
    `/checkout/v2/order/${encodeURIComponent(merchantOrderId)}/status`,
  );
}
