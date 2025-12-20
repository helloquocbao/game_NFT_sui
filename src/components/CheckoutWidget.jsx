import { CheckoutWidget } from "@beep-it/checkout-widget";

export function BeepCheckout({ invoiceId, onSuccess }) {
  if (!invoiceId) return null;

  return (
    <CheckoutWidget
      publishableKey="beep_pk_7TPA9_gjAUwiyKOoEhEVU3WoxZPtTDk2"
      primaryColor="#007bff"
      labels={{
        scanQr: "Quét QR để chơi game",
      }}
      assets={[
        {
          name: "1 lượt chơi",
          price: "0.1",
          quantity: 1,
        },
      ]}
      invoiceId={invoiceId}
      onError={(error) => {
        console.error("Beep Widget Error:", error);
      }}
      onSuccess={(data) => {
        console.log("Payment Success:", data);
        onSuccess?.(data);
      }}
    />
  );
}
