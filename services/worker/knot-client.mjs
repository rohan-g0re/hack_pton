/**
 * Knot Shopping API client — sandbox success when credentials are absent (hackathon demo).
 * @see https://docs.knotapi.com/shopping/quickstart
 */
export async function knotPlaceOrder({ items, cardToken, merchant = "Walmart" }) {
  const clientId = process.env.KNOT_CLIENT_ID;
  const secret = process.env.KNOT_CLIENT_SECRET;

  if (!clientId || !secret) {
    return {
      ok: true,
      sandbox: true,
      knot_session_id: `knot-sandbox-${Date.now()}`,
      merchant,
      items
    };
  }

  const response = await fetch(`${process.env.KNOT_API_BASE || "https://api.knotapi.com"}/shopping/checkout`, {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`
    },
    body: JSON.stringify({
      merchant,
      card_token: cardToken,
      items: items.map((item) => ({
        name: item.name,
        quantity: item.quantity ?? item.reorderQuantity ?? 1
      }))
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Knot API error: ${response.status} ${text}`);
  }

  return response.json();
}
