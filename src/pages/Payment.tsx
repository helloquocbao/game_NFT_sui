import { CheckoutWidget } from "@beep-it/checkout-widget";

export default function Payment() {
  return (
    <CheckoutWidget
      publishableKey="beep_pk_FG_X-j2A9wrL8vEC47gVm9M2jwakEmHj"
      primaryColor="#007bff"
      labels={{
        scanQr: "Scan QR Code to Pay",
        paymentLabel: "My Store Checkout",
      }}
      assets={[
        {
          price: "0.2",
          quantity: 1,
          name: "Play turm",
          description: "Buy the turn game game",
        },
      ]}
    />
  );
}
