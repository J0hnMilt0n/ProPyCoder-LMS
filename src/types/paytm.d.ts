export interface PaytmResultInfo {
  resultStatus: string;
  resultCode: string;
  resultMsg: string;
}

export interface PaytmInitiateResponseBody {
  resultInfo: PaytmResultInfo;
  txnToken?: string;
  body?: {
    resultInfo: PaytmResultInfo;
    txnToken?: string;
  };
}

export interface PaytmStatusResponseBody {
  resultInfo: PaytmResultInfo;
  body?: {
    resultInfo: PaytmResultInfo;
    txnId?: string;
    orderId?: string;
    txnAmount?: string;
    txnDate?: string;
    gatewayName?: string;
    bankTxnId?: string;
    paymentMode?: string;
    refundAmt?: string;
    txnStatus?: string;
    ORDERID?: string;
    TXNID?: string;
    TXNAMOUNT?: string;
    TXNDATE?: string;
    GATEWAYNAME?: string;
    BANKTXNID?: string;
    PAYMENTMODE?: string;
    REFUNDAMT?: string;
    TXNSTATUS?: string;
    STATUS?: string;
    RESPCODE?: string;
    RESPMSG?: string;
    BANKNAME?: string;
    CHECKSUMHASH?: string;
    checksumHash?: string;
  };
}

export interface PaytmApiResponse<T> {
  body?: T;
  resultInfo?: PaytmResultInfo;
}
