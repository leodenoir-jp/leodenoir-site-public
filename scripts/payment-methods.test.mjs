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
const { japaneseLessonMenus } = await load("src/data/platform.ts");

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

test("all Japanese lesson base prices increase by 5 USD and selling prices follow", () => {
  const previousPrices = {
    "jp-trial": 12,
    "jp-free-talk": 25,
    "jp-daily-conversation": 30,
    "jp-travel-conversation": 30,
    "jp-business-negotiation": 35,
    "jp-business-conversation": 30,
    "jp-business-writing": 30,
    "jp-business-presentation": 35,
    "jp-expat-prep": 35,
    "jp-intensive-interview": 30,
    "jp-intensive-presentation": 30,
    "jp-intensive-exhibition": 30,
    "jp-study-abroad": 30,
    "jp-jlpt-n5": 25,
    "jp-jlpt-n4-n2": 30,
    "jp-jlpt-n1": 35
  };

  assert.equal(japaneseLessonMenus.length, Object.keys(previousPrices).length);
  for (const menu of japaneseLessonMenus) {
    assert.equal(menu.currency, "USD");
    assert.equal(menu.unitPrice, previousPrices[menu.id] + 5, menu.id);
  }
  assert.equal(getPaymentPricingBreakdown(japaneseLessonMenus[0].unitPrice, "PayPay", "USD").finalCustomerPrice, 18);
  assert.equal(getPaymentPricingBreakdown(japaneseLessonMenus[1].unitPrice, "PayPay", "USD").finalCustomerPrice, 32);
  assert.equal(getPaymentPricingBreakdown(40, "PayPay", "USD").finalCustomerPrice, 42);
});
