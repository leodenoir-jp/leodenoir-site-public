export function isPayPalPaymentLink(value: string) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "paypal.com" || host.endsWith(".paypal.com")
      || host === "paypal.me" || host.endsWith(".paypal.me")
      || host === "py.pl";
  } catch {
    return false;
  }
}
