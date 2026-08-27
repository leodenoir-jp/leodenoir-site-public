export type PaymentCurrency = "USD" | "JPY";
export type PaymentMethod = "PayPal" | "PayPay" | "BankTransfer";

export type PaymentPricingBreakdown = {
  basePrice: number;
  paymentAdjustedPrice: number;
  paymentMethod: PaymentMethod;
  variableProcessingRate: number;
  pricingReferenceRate: number;
  finalCustomerPrice: number;
};

export const defaultVariableProcessingRate = 0.041;

export function normalizeVariableProcessingRate(
  value: string | number | undefined,
  fallback = defaultVariableProcessingRate
) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed < 1
    ? parsed
    : fallback;
}

export function roundPaymentPrice(amount: number, currency: PaymentCurrency) {
  return currency === "JPY" ? Math.round(amount) : Math.round(amount * 100) / 100;
}

export function calculatePaymentAdjustedPrice(
  basePrice: number,
  variableProcessingRate: number,
  currency: PaymentCurrency
) {
  if (!Number.isFinite(basePrice) || basePrice < 0) {
    throw new Error("Base price must be a non-negative finite number.");
  }
  if (!Number.isFinite(variableProcessingRate) || variableProcessingRate < 0 || variableProcessingRate >= 1) {
    throw new Error("Variable processing rate must be at least 0 and less than 1.");
  }

  return roundPaymentPrice(basePrice / (1 - variableProcessingRate), currency);
}

export function createPaymentPricingBreakdown({
  basePrice,
  paymentMethod,
  variableProcessingRate,
  pricingReferenceRate,
  currency
}: {
  basePrice: number;
  paymentMethod: PaymentMethod;
  variableProcessingRate: number;
  pricingReferenceRate: number;
  currency: PaymentCurrency;
}): PaymentPricingBreakdown {
  const paymentAdjustedPrice = calculatePaymentAdjustedPrice(basePrice, pricingReferenceRate, currency);
  return {
    basePrice,
    paymentAdjustedPrice,
    paymentMethod,
    variableProcessingRate,
    pricingReferenceRate,
    finalCustomerPrice: paymentAdjustedPrice
  };
}
