import React from "react";
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
          assetId: "8a5fb17e-acb4-4b50-bae5-fcfe0e689420",
          quantity: 1,
          name: "Premium Coffee",
          description: "Fresh roasted arabica beans",
        },
      ]}
    />
  );
}
