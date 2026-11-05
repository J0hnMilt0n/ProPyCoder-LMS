export type PaytmOrderStatus = {
  orderId?: string;
  txnId?: string;
  txnAmount?: string;
  txnDate?: string;
  status?: string;
  responseCode?: string;
  responseMessage?: string;
  bankTxnId?: string;
  bankName?: string;
  paymentMode?: string;
  checksumHash?: string;
};
