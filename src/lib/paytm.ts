import { createHmac } from "crypto";
import type { PaytmOrderStatus } from "./paytm-types";

export type { PaytmOrderStatus };

const PAYTM_STAGING = "https://securegw-stage.paytm.in";
const PAYTM_PRODUCTION = "https://securegw.paytm.in";

type PaytmConfig = {
  mid: string;
  merchantKey: string;
  website: string;
  industryType: string;
  channel: string;
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

function getConfig(): PaytmConfig {
  const mid = process.env.PAYTM_MID;
  const merchantKey = process.env.PAYTM_MERCHANT_KEY;
  const website = process.env.PAYTM_WEBSITE;
  const industryType = process.env.PAYTM_INDUSTRY_TYPE;
  const channel = process.env.PAYTM_CHANNEL;

  if (!mid || !merchantKey || !website || !industryType || !channel) {
    throw new Error("Paytm credentials are not configured");
  }

  const environment = process.env.PAYTM_ENVIRONMENT ?? "STAGING";
  if (environment !== "STAGING" && environment !== "PRODUCTION") {
    throw new Error("PAYTM_ENVIRONMENT must be STAGING or PRODUCTION");
  }

  return {
    mid,
    merchantKey,
    website,
    industryType,
    channel,
    baseUrl:
      environment === "PRODUCTION" ? PAYTM_PRODUCTION : PAYTM_STAGING,
  };
}

function generateChecksum(
  params: Record<string, string>,
  merchantKey: string,
): string {
  const data = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const encoder = new TextEncoder();
  const keyData = encoder.encode(merchantKey);
  const msgData = encoder.encode(data);
  const hash = createHmac("sha256", keyData)
    .update(msgData)
    .digest("hex");
  return hash;
}

function flattenObject(obj: Record<string, unknown>): Record<string, string> {
  const flat: Record<string, string> = {};
  function walk(o: Record<string, unknown>, prefix: string) {
    for (const [k, v] of Object.entries(o)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object" && !Array.isArray(v)) {
        walk(v as Record<string, unknown>, key);
      } else if (v !== undefined && v !== null) {
        flat[key] = String(v);
      }
    }
  }
  walk(obj, "");
  return flat;
}

export async function createPaytmOrder(input: {
  paymentId: string;
  amountRupees: number;
  redirectUrl: string;
}): Promise<{ redirectUrl: string }> {
  const config = getConfig();

  // The checksum/signature is computed over the request body and placed in head.signature.
  const requestBody = {
    requestType: "Payment",
    mid: config.mid,
    websiteName: config.website,
    orderId: input.paymentId,
    callbackUrl: input.redirectUrl,
    txnAmount: {
      value: input.amountRupees.toFixed(2),
      currency: "INR",
    },
    userInfo: {
      custId: input.paymentId,
    },
    paymentEnableModes: ["UPI", "CC", "DC", "NB", "PAYTM_DIGITAL_WALLET"],
  };
  const signature = generateChecksum(
    flattenObject(requestBody),
    config.merchantKey,
  );

  const body = {
    head: {
      clientToken: config.mid,
      clientId: config.mid,
      version: "v1",
      requestTimestamp: Date.now(),
      channelId: config.channel,
      signature,
    },
    body: requestBody,
  };

  const response = await fetch(
    `${config.baseUrl}/theia/api/v1/initiateTransaction?mid=${config.mid}&orderId=${input.paymentId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new PaytmApiError(
      `Paytm initiate failed (${response.status})${errText ? ` ${errText}` : ""}`,
      response.status,
    );
  }

  const data = await response.json();
  const responseBody = data?.body ?? data;
  const txnToken = responseBody?.txnToken;
  const resultInfo = responseBody?.resultInfo ?? {};

  if (!txnToken || resultInfo.resultStatus !== "S") {
    throw new PaytmApiError(
      `Paytm returned no token: ${resultInfo.resultMsg ?? "unknown"}`,
      502,
    );
  }

  const redirectUrl = `${
    config.baseUrl
  }/theia/api/v1/showPaymentPage?mid=${config.mid}&orderId=${input.paymentId}&txnToken=${txnToken}&amount=${input.amountRupees.toFixed(2)}`;

  return { redirectUrl };
}

export async function getPaytmOrderStatus(
  orderId: string,
): Promise<PaytmOrderStatus> {
  const config = getConfig();

  const requestBody = {
    mid: config.mid,
    orderId,
  };
  const signature = generateChecksum(
    flattenObject(requestBody),
    config.merchantKey,
  );

  const body = {
    head: {
      clientToken: config.mid,
      clientId: config.mid,
      version: "v1",
      requestTimestamp: Date.now(),
      channelId: config.channel,
      signature,
    },
    body: requestBody,
  };

  const response = await fetch(
    `${config.baseUrl}/theia/api/v1/transaction/status?mid=${config.mid}&orderId=${orderId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new PaytmApiError(
      `Paytm status failed (${response.status})${errText ? ` ${errText}` : ""}`,
      response.status,
    );
  }

  const data = await response.json();
  const responseBody = data?.body ?? data;

  return {
    orderId: responseBody?.ORDERID ?? responseBody?.orderId ?? orderId,
    txnId: responseBody?.TXNID ?? responseBody?.txnId,
    txnAmount: responseBody?.TXNAMOUNT ?? responseBody?.txnAmount,
    txnDate: responseBody?.TXNDATE ?? responseBody?.txnDate,
    status: responseBody?.STATUS ?? responseBody?.status,
    responseCode: responseBody?.RESPCODE ?? responseBody?.respCode,
    responseMessage:
      responseBody?.RESPMSG ?? responseBody?.respMessage,
    bankTxnId: responseBody?.BANKTXNID ?? responseBody?.bankTxnId,
    bankName: responseBody?.BANKNAME ?? responseBody?.bankName,
    paymentMode: responseBody?.PAYMENTMODE ?? responseBody?.paymentMode,
    checksumHash: responseBody?.CHECKSUMHASH ?? responseBody?.checksumHash,
  };
}
