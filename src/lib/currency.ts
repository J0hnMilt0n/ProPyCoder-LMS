// Single source of truth for money display — all prices site-wide are in INR.
export const CURRENCY_CODE = "INR";
export const CURRENCY_SYMBOL = "₹";

/** Format an amount in rupees. `decimals` defaults to 0 for catalog-style
 *  prices ("₹1,999") — pass 2 for checkout/admin style ("₹1,999.00"). */
export function formatINR(amount: number, decimals = 0): string {
  const value = Number.isFinite(amount) ? amount : 0;
  return `${CURRENCY_SYMBOL}${value.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}
