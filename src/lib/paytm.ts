
import crypto from "crypto";
import type { PaytmOrderStatus } from "./paytm-types";

export type { PaytmOrderStatus };

const PAYTM_STAGING = "https://securestage.paytmpayments.com";
const PAYTM_PRODUCTION = "https://secure.paytmpayments.com";

// Paytm checksum algorithm IV.
const PAYTM_IV = "@@@@&&&&####$$$$";

type PaytmConfig = {
  mid: string;
  merchantKey: string;
  website: string;
  baseUrl: string;
};

export class PaytmApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly providerCode?: string,
    readonly providerMessage?: string,
  ) {
    super(message);
    this.name = "PaytmApiError";
  }
}

/**
 * Get Paytm configuration.
 */
function getConfig(): PaytmConfig {
  const mid = process.env.PAYTM_MID?.trim();
  const merchantKey = process.env.PAYTM_MERCHANT_KEY;
  const website = process.env.PAYTM_WEBSITE?.trim();

  if (!mid || !merchantKey || !website) {
    throw new Error(
      "Paytm configuration missing. Check PAYTM_MID, PAYTM_MERCHANT_KEY and PAYTM_WEBSITE.",
    );
  }

  // Paytm merchant key must be exactly 16 bytes for AES-128.
  if (Buffer.byteLength(merchantKey, "utf8") !== 16) {
    throw new Error(
      "Invalid Paytm merchant key. AES-128 requires exactly 16 bytes.",
    );
  }

  const environment = (
    process.env.PAYTM_ENVIRONMENT ?? "STAGING"
  ).trim().toUpperCase();

  if (environment !== "STAGING" && environment !== "PRODUCTION") {
    throw new Error(
      "PAYTM_ENVIRONMENT must be STAGING or PRODUCTION.",
    );
  }

  return {
    mid,
    merchantKey,
    website,
    baseUrl:
      environment === "PRODUCTION"
        ? PAYTM_PRODUCTION
        : PAYTM_STAGING,
  };
}

/**
 * Generate a random 4-character salt.
 */
function randomSalt(length = 4): string {
  return crypto
    .randomBytes(Math.ceil((length * 3) / 4))
    .toString("base64")
    .slice(0, length);
}

/**
 * Generate Paytm checksum signature.
 *
 * SHA256(payload + "|" + salt)
 * AES-128-CBC(hash + salt)
 *
 * The payload must be the exact JSON string sent to Paytm.
 */
function generateSignature(
  payload: string,
  merchantKey: string,
): string {
  const salt = randomSalt(4);

  const hash = crypto
    .createHash("sha256")
    .update(`${payload}|${salt}`)
    .digest("hex");

  const cipher = crypto.createCipheriv(
    "aes-128-cbc",
    Buffer.from(merchantKey, "utf8"),
    Buffer.from(PAYTM_IV, "utf8"),
  );

  const encrypted = Buffer.concat([
    cipher.update(hash + salt, "utf8"),
    cipher.final(),
  ]);

  return encrypted.toString("base64");
}

/**
 * Parse Paytm error response.
 */
function buildHttpError(
  label: string,
  status: number,
  errText: string,
): PaytmApiError {
  let providerCode: string | undefined;
  let providerMessage: string | undefined =
    errText || undefined;

  try {
    const parsed = JSON.parse(errText);

    const info =
      parsed?.body?.resultInfo ??
      parsed?.resultInfo;

    if (info) {
      providerCode =
        info.resultCode != null
          ? String(info.resultCode)
          : undefined;

      providerMessage =
        info.resultMsg ?? providerMessage;
    }
  } catch {
    // Response was not JSON.
  }

  return new PaytmApiError(
    `${label} failed (${status})${
      errText ? `: ${errText}` : ""
    }`,
    status,
    providerCode ?? String(status),
    providerMessage,
  );
}

/**
 * Make a POST request to Paytm.
 *
 * Do not automatically retry payment initiation.
 * A gateway timeout does not guarantee that Paytm
 * did not process the original request.
 */
async function postToPaytm(
  url: string,
  body: unknown,
): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
}

/**
 * Create Paytm payment order.
 */
export async function createPaytmOrder(input: {
  paymentId: string;
  amountRupees: number;
  redirectUrl: string;
}): Promise<{ redirectUrl: string }> {
  const config = getConfig();

  // Validate amount.
  if (
    !Number.isFinite(input.amountRupees) ||
    input.amountRupees <= 0
  ) {
    throw new Error("Invalid payment amount.");
  }

  // Validate order ID.
  if (
    !input.paymentId ||
    !/^[A-Za-z0-9_@-]{1,50}$/.test(input.paymentId)
  ) {
    throw new Error("Invalid Paytm order ID.");
  }

  // Validate callback URL.
  let callbackUrl: URL;

  try {
    callbackUrl = new URL(input.redirectUrl);
  } catch {
    throw new Error("Invalid Paytm callback URL.");
  }

  if (
    callbackUrl.protocol !== "https:" &&
    callbackUrl.hostname !== "localhost"
  ) {
    throw new Error("Paytm callback URL must use HTTPS.");
  }

  const amount = input.amountRupees.toFixed(2);

  /**
   * Payment initiation request body.
   *
   * Payment modes are intentionally not restricted here.
   * Paytm will show the payment modes enabled for your MID.
   */
  const requestBody = {
    requestType: "Payment",
    mid: config.mid,
    websiteName: config.website,
    orderId: input.paymentId,
    callbackUrl: input.redirectUrl,
    txnAmount: {
      value: amount,
      currency: "INR",
    },
    userInfo: {
      custId: input.paymentId,
    },
  };

  // Serialize once. Use this exact string for checksum and request.
  const requestBodyString = JSON.stringify(requestBody);

  const signature = generateSignature(
    requestBodyString,
    config.merchantKey,
  );

  const requestPayload = {
    head: {
      signature,
    },
    body: requestBody,
  };

  const url =
    `${config.baseUrl}/theia/api/v1/initiateTransaction` +
    `?mid=${encodeURIComponent(config.mid)}` +
    `&orderId=${encodeURIComponent(input.paymentId)}`;

  console.info("[paytm] Initiating payment:", {
    environment:
      config.baseUrl === PAYTM_STAGING
        ? "STAGING"
        : "PRODUCTION",
    midSuffix: config.mid.slice(-4),
    website: config.website,
    orderId: input.paymentId,
    amount,
  });

  let response: Response;

  try {
    response = await postToPaytm(url, requestPayload);
  } catch (error) {
    console.error("[paytm] Initiation network error:", error);

    throw new PaytmApiError(
      "Unable to reach Paytm. Check the order status before attempting another payment.",
      502,
      "NETWORK_ERROR",
      error instanceof Error ? error.message : "Network error",
    );
  }

  const responseText = await response.text();

  if (!response.ok) {
    throw buildHttpError(
      "Paytm initiate",
      response.status,
      responseText,
    );
  }

  let data: any;

  try {
    data = JSON.parse(responseText);
  } catch {
    throw new PaytmApiError(
      "Paytm returned an invalid JSON response.",
      502,
      "INVALID_RESPONSE",
      responseText.slice(0, 500),
    );
  }

  const responseBody = data?.body ?? data;
  const resultInfo = responseBody?.resultInfo ?? {};
  const txnToken = responseBody?.txnToken;

  console.info("[paytm] Initiate response:", {
    httpStatus: response.status,
    resultStatus: resultInfo.resultStatus,
    resultCode: resultInfo.resultCode,
    resultMsg: resultInfo.resultMsg,
    midSuffix: config.mid.slice(-4),
    website: config.website,
    environment:
      config.baseUrl === PAYTM_STAGING
        ? "STAGING"
        : "PRODUCTION",
    orderId: input.paymentId,
    amount,
    tokenReceived: Boolean(txnToken),
  });

  if (
    !txnToken ||
    resultInfo.resultStatus !== "S"
  ) {
    throw new PaytmApiError(
      `Paytm returned no token: ${
        resultInfo.resultMsg ?? "Unknown error"
      }`,
      502,
      resultInfo.resultCode != null
        ? String(resultInfo.resultCode)
        : undefined,
      resultInfo.resultMsg,
    );
  }

  /**
   * Keep the existing redirectUrl contract
   * expected by your payment API route.
   */
  const paymentPageUrl = new URL(
    `${config.baseUrl}/theia/api/v1/showPaymentPage`,
  );

  paymentPageUrl.searchParams.set("mid", config.mid);
  paymentPageUrl.searchParams.set("orderId", input.paymentId);
  paymentPageUrl.searchParams.set("txnToken", txnToken);
  paymentPageUrl.searchParams.set("amount", amount);

  return {
    redirectUrl: paymentPageUrl.toString(),
  };
}

/**
 * Get Paytm transaction status using V3 API.
 */
export async function getPaytmOrderStatus(
  orderId: string,
): Promise<PaytmOrderStatus> {
  const config = getConfig();

  if (
    !orderId ||
    !/^[A-Za-z0-9_@-]{1,50}$/.test(orderId)
  ) {
    throw new Error("Invalid Paytm order ID.");
  }

  const requestBody = {
    mid: config.mid,
    orderId,
  };

  const requestBodyString = JSON.stringify(requestBody);

  const signature = generateSignature(
    requestBodyString,
    config.merchantKey,
  );

  const requestPayload = {
    head: {
      signature,
    },
    body: requestBody,
  };

  const response = await postToPaytm(
    `${config.baseUrl}/v3/order/status`,
    requestPayload,
  );

  const responseText = await response.text();

  if (!response.ok) {
    throw buildHttpError(
      "Paytm status",
      response.status,
      responseText,
    );
  }

  let data: any;

  try {
    data = JSON.parse(responseText);
  } catch {
    throw new PaytmApiError(
      "Paytm returned an invalid status response.",
      502,
      "INVALID_RESPONSE",
      responseText.slice(0, 500),
    );
  }

  const responseBody = data?.body ?? {};
  const resultInfo = responseBody?.resultInfo ?? {};

  return {
    orderId:
      responseBody.orderId ??
      responseBody.ORDERID ??
      orderId,

    txnId:
      responseBody.txnId ??
      responseBody.TXNID,

    txnAmount:
      responseBody.txnAmount ??
      responseBody.TXNAMOUNT,

    txnDate:
      responseBody.txnDate ??
      responseBody.TXNDATE,

    status:
      resultInfo.resultStatus ??
      responseBody.STATUS ??
      responseBody.status,

    responseCode:
      resultInfo.resultCode ??
      responseBody.RESPCODE ??
      responseBody.respCode,

    responseMessage:
      resultInfo.resultMsg ??
      responseBody.RESPMSG ??
      responseBody.respMsg,

    bankTxnId:
      responseBody.bankTxnId ??
      responseBody.BANKTXNID,

    bankName:
      responseBody.bankName ??
      responseBody.BANKNAME,

    paymentMode:
      responseBody.paymentMode ??
      responseBody.PAYMENTMODE,

    checksumHash:
      responseBody.CHECKSUMHASH ??
      responseBody.checksumHash,
  };
}
