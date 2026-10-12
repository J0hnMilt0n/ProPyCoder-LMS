import { formatINR } from "@/lib/currency";
import { discountPercent } from "@/lib/pricing";

interface PriceTagProps {
  price: number;
  offerPrice?: number | null;
  size?: "sm" | "lg";
}

/**
 * Shared price display: Free, plain ₹, or strikethrough MRP + offer price
 * with a "% OFF" badge. Used on course cards, detail page and bundle pages.
 */
export function PriceTag({ price, offerPrice, size = "sm" }: PriceTagProps) {
  if (!price) return <strong className="price-tag">Free</strong>;

  const discount = discountPercent({ price, offerPrice: offerPrice ?? null });
  const effective = Math.min(
    price,
    offerPrice !== null && offerPrice !== undefined && offerPrice >= 0 && offerPrice < price
      ? offerPrice
      : price,
  );

  if (!discount) {
    return (
      <strong className={`price-tag ${size === "lg" ? "price-tag-lg" : ""}`}>
        {formatINR(price)}
      </strong>
    );
  }

  return (
    <span className={`price-tag-offer ${size === "lg" ? "price-tag-lg" : ""}`}>
      <span className="price-tag-mrp">{formatINR(price)}</span>
      <strong className="price-tag-now">{formatINR(effective)}</strong>
      <span className="price-tag-badge">{discount}% OFF</span>
    </span>
  );
}