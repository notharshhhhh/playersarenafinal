import { Cashfree } from "cashfree-pg";
import { getFirebaseAdmin, FieldValue } from "../lib/firebase-admin";

export default async function handler(req: any, res: any) {
  // CORS support
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  console.log("[Cashfree Create Order] Route hit");
  
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  let db: any = null;
  try {
    const admin = getFirebaseAdmin();
    db = admin.db;
  } catch (adminErr: any) {
    console.warn("[Cashfree Create Order] Firebase Admin init notice:", adminErr?.message);
  }

  try {
    const { amount, userId, customerName, customerEmail, customerPhone } = req.body || {};
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    if (!userId) {
      return res.status(400).json({ error: "Missing userId" });
    }

    // Try to get config from Firestore
    let clientId = process.env.CASHFREE_CLIENT_ID;
    let clientSecret = process.env.CASHFREE_CLIENT_SECRET;
    let isProdEnv = process.env.CASHFREE_ENV === "PRODUCTION";

    if (db) {
      try {
        const configDoc = await db.collection('paymentSettings').doc('cashfree').get();
        if (configDoc.exists && configDoc.data()?.isActive) {
          clientId = configDoc.data()?.apiKey || clientId;
          clientSecret = configDoc.data()?.secretKey || clientSecret;
          isProdEnv = configDoc.data()?.isProduction ?? isProdEnv;
        }
      } catch (e) {}
    }

    if (!clientId || !clientSecret) {
      return res.status(500).json({ error: "Cashfree credentials are missing. Please configure CASHFREE_CLIENT_ID and CASHFREE_CLIENT_SECRET." });
    }

    const isProd = isProdEnv || (clientId && !clientId.includes('TEST'));

    (Cashfree as any).XClientId = clientId;
    (Cashfree as any).XClientSecret = clientSecret;
    (Cashfree as any).XEnvironment = isProd ? (Cashfree as any).Environment.PRODUCTION : (Cashfree as any).Environment.SANDBOX;

    const orderId = `order_${Date.now()}_${userId}`;
    
    // Determine base URL
    let baseUrlFull = process.env.APP_URL;
    if (!baseUrlFull) {
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      baseUrlFull = `${protocol}://${host}`;
    }
    baseUrlFull = baseUrlFull.replace(/\/$/, "");

    const requestData = {
      order_amount: Number(amount),
      order_currency: "INR",
      order_id: orderId,
      customer_details: {
        customer_id: String(userId),
        customer_phone: customerPhone || "9999999999",
        customer_name: customerName || "Khel Galli User",
        customer_email: customerEmail || "user@khelgalli.com"
      },
      order_meta: {
        return_url: `${baseUrlFull}/wallet?order_id={order_id}`,
        notify_url: `${baseUrlFull}/api/cashfree/webhook`
      }
    };

    console.log(`[Cashfree Create Order] Processing order: ${orderId}`);
    const response = await (Cashfree as any).PGCreateOrder("2023-08-01", requestData);
    res.json(response.data);
  } catch (error: any) {
    console.error("[Cashfree Create Order] Error:", error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data?.message || error.message });
  }
}
