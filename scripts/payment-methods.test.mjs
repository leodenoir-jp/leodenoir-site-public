import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("vite/package.json"))("esbuild");

async function load(entry, define = {}) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
    define
  });
  const module = { exports: {} };
  new Function("module", "exports", result.outputFiles[0].text)(module, module.exports);
  return module.exports;
}

const { isPayPalPaymentLink, isPaymentCurrencySupported } = await load("shared/paymentMethods.ts");
const { getPaymentPricingBreakdown } = await load("src/config/paymentPricing.ts", { "import.meta.env": "{}" });

test("new payment links reject PayPal hosts without blocking PayPay", () => {
  assert.equal(isPayPalPaymentLink("https://www.paypal.com/invoice/payerView/details"), true);
  assert.equal(isPayPalPaymentLink("https://paypal.me/example"), true);
  assert.equal(isPayPalPaymentLink("https://py.pl/example"), true);
  assert.equal(isPayPalPaymentLink("https://paypal.com.evil.example/pay"), false);
  assert.equal(isPayPalPaymentLink("https://paypay.ne.jp/example"), false);
});

test("removing PayPal as a choice leaves the selling price unchanged", () => {
  for (const basePrice of [12, 25, 35, 240, 420]) {
    for (const currency of ["USD", "JPY"]) {
      assert.equal(
        getPaymentPricingBreakdown(basePrice, "PayPay", currency).finalCustomerPrice,
        getPaymentPricingBreakdown(basePrice, "PayPal", currency).finalCustomerPrice
      );
    }
  }
});

test("PayPay purchase offers can be billed only in JPY", () => {
  assert.equal(isPaymentCurrencySupported("PayPay", "JPY"), true);
  assert.equal(isPaymentCurrencySupported("PayPay", "USD"), false);
  assert.equal(isPaymentCurrencySupported("BankTransfer", "USD"), true);
  assert.equal(isPaymentCurrencySupported("BankTransfer", "JPY"), true);
});
