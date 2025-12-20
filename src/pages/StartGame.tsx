import { useState } from "react";
import { BeepCheckout } from "../components/CheckoutWidget";

export default function StartGame() {
  const [invoiceId, setInvoiceId] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handlePlay() {
    setLoading(true);

    const res = await fetch("http://localhost:3001/api/play/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "demo-user-1", // sau này thay bằng auth thật
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (data.canPlay) {
      startKaboomGame();
      return;
    }

    if (data.invoiceId) {
      setInvoiceId(data.invoiceId);
      // Không poll ngay, đợi onSuccess từ widget
    }
  }

  function handlePaymentSuccess() {
    console.log("✅ Payment successful, checking play status...");
    pollPlayStatus();
  }

  function pollPlayStatus() {
    const timer = setInterval(async () => {
      const res = await fetch(
        "http://localhost:3001/api/play/status?userId=demo-user-1"
      );
      const data = await res.json();

      if (data.canPlay) {
        clearInterval(timer);
        startKaboomGame();
      }
    }, 3000);
  }

  function startKaboomGame() {
    console.log("🎮 START GAME");
    // gọi hàm init Kaboom ở đây
  }

  return (
    <>
      <button onClick={handlePlay} disabled={loading}>
        {loading ? "Loading..." : "PLAY"}
      </button>

      <BeepCheckout invoiceId={invoiceId} onSuccess={handlePaymentSuccess} />
    </>
  );
}
