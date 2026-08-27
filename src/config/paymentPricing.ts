import {
  createPaymentPricingBreakdown,
  normalizeVariableProcessingRate,
  type PaymentCurrency,
  type PaymentMethod
} from "../../shared/paymentPricing";

const paymentEnvironment = import.meta.env as Record<string, string | undefined>;

export const paymentPricingConfig = {
  pricingReferenceMethod: "PayPal" as const,
  variableProcessingRates: {
    PayPal: normalizeVariableProcessingRate(paymentEnvironment.VITE_PAYPAL_VARIABLE_PROCESSING_RATE),
    PayPay: normalizeVariableProcessingRate(paymentEnvironment.VITE_PAYPAY_VARIABLE_PROCESSING_RATE, 0),
    BankTransfer: normalizeVariableProcessingRate(paymentEnvironment.VITE_BANK_TRANSFER_VARIABLE_PROCESSING_RATE, 0)
  } satisfies Record<PaymentMethod, number>
};

export function getPaymentPricingBreakdown(
  basePrice: number,
  paymentMethod: PaymentMethod,
  currency: PaymentCurrency
) {
  return createPaymentPricingBreakdown({
    basePrice,
    paymentMethod,
    variableProcessingRate: paymentPricingConfig.variableProcessingRates[paymentMethod],
    pricingReferenceRate: paymentPricingConfig.variableProcessingRates[paymentPricingConfig.pricingReferenceMethod],
    currency
  });
}
