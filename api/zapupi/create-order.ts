import axios from "axios";
import { getFirebaseAdmin, FieldValue } from "./lib/firebase-admin";

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

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  console.log("[ZapUPI Create Order] Route hit successfully");

  let db: any = null;
  let FieldValueObj: any = null;
  try {
    const admin = getFirebaseAdmin();
    db = admin.db;
    FieldValueObj = admin.FieldValue;
  } catch (adminErr: any) {
    console.warn("[ZapUPI Create Order] Firebase Admin init notice:", adminErr?.message);
  }

  try {
    const { amount, userId } = req.body || {};
    
    if (!amount || Number(amount) <= 0) {
      console.warn("[ZapUPI Create Order] Invalid amount:", amount);
      return res.status(400).json({ success: false, error: "Invalid amount" });
    }

    if (!userId) {
      console.warn("[ZapUPI Create Order] Missing userId");
      return res.status(400).json({ success: false, error: "Missing userId" });
    }

    // Try to get config from Firestore first, fallback to env
    let apiKey = process.env.ZAPUPI_API_KEY;
    if (db) {
      try {
        const configDoc = await db.collection('paymentSettings').doc('zapupi').get();
        if (configDoc.exists && configDoc.data()?.isActive) {
          apiKey = configDoc.data()?.apiKey || apiKey;
        }
      } catch (e) {
        console.warn("[ZapUPI Create Order] Could not fetch config from Firestore, using ENV fallback.");
      }
    }

    if (!apiKey) {
      console.error("[ZapUPI Create Order] API Key missing in Firestore and ENV");
      return res.status(500).json({ success: false, error: "ZapUPI API Key is missing. Add it in Admin -> Payment Gateways -> ZapUPI (gateway ON) or set ZAPUPI_API_KEY in Vercel." });
    }

    // Fetch user profile from Firestore for accurate metadata
    let customerName = "Khel Galli User";
    let customerEmail = "user@khelgalli.com";
    let customerPhone = "9999999999";

    if (db) {
      try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
          const userData = userDoc.data() || {};
          customerName = userData.username || customerName;
          customerEmail = userData.email || customerEmail;
          customerPhone = userData.mobile || userData.phone || customerPhone;
        }
      } catch (err) {
        console.warn(`[ZapUPI Create Order] Could not fetch user doc for ${userId}`);
      }
    }

    const orderId = `zap_${Date.now()}_${userId}`;
    
    // Determine base URL, prioritizing APP_URL then Vercel headers
    let baseUrlFull = process.env.APP_URL;
    if (!baseUrlFull) {
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      baseUrlFull = `${protocol}://${host}`;
    }
    baseUrlFull = baseUrlFull.replace(/\/$/, "");

    console.log(`[ZapUPI Create Order] Creating order: ${orderId} for User: ${userId}`);
    
    // Save transaction BEFORE creating at gateway if Firestore is available
    if (db && FieldValueObj) {
      try {
        await db.collection('transactions').doc(orderId).set({
          userId: userId,
          amount: Number(amount),
          status: 'pending',
          type: 'deposit',
          gateway: 'zapupi',
          title: 'Deposit via ZapUPI',
          createdAt: FieldValueObj.serverTimestamp(),
          updatedAt: FieldValueObj.serverTimestamp()
        }, { merge: true });
      } catch (txErr: any) {
        console.warn("[ZapUPI Create Order] Transaction pre-save notice:", txErr.message);
      }
    }

    const payload = {
      zap_key: apiKey,
      api_key: apiKey,
      order_id: orderId,
      client_order_id: orderId,
      amount: String(amount),
      customer_name: customerName,
      customer_email: customerEmail,
      customer_mobile: String(customerPhone).replace(/\D/g, '').slice(-10) || "9999999999",
      webhook_url: `${baseUrlFull}/api/zapupi/webhook`,
      callback_url: `${baseUrlFull}/wallet?payment=success&order_id=${orderId}`,
      success_url: `${baseUrlFull}/wallet?payment=success&order_id=${orderId}`,
      failed_url: `${baseUrlFull}/wallet?payment=failed&order_id=${orderId}`,
      timeout_url: `${baseUrlFull}/wallet?payment=timeout&order_id=${orderId}`,
      redirect_url: `${baseUrlFull}/wallet?payment=success&order_id=${orderId}`,
      return_url: `${baseUrlFull}/wallet?payment=success&order_id=${orderId}`,
      description: `Wallet Deposit - ${userId}`
    };

    let apiBase = (process.env.ZAPUPI_BASE_URL || "https://pay.zapupi.com").replace(/\/$/, "");
    if (apiBase.includes("api.zapupi.com")) {
      apiBase = apiBase.replace("api.zapupi.com", "pay.zapupi.com");
    }
    
    const zapUrl = `${apiBase}/api/create-order`;

    try {
      console.log(`[ZapUPI Create Order] Calling gateway: ${zapUrl}`);
      const response = await axios.post(zapUrl, payload, {
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'KhelGalli-Vercel/1.6',
          'Accept': 'application/json'
        },
        timeout: 15000
      });

      const json = response.data;
      const paymentUrl = json.redirect_url || json.payment_url || json.paymentUrl || json.url || (json.data && (json.data.payment_url || json.data.redirect_url));

      if (json.status === 'success' || json.status === 'SUCCESS' || paymentUrl) {
        console.log(`[ZapUPI Create Order] Gateway success for ${orderId}. URL: ${paymentUrl}`);
        return res.status(200).json({ 
          success: true,
          order_id: orderId,
          payment_url: paymentUrl,
          redirect_url: paymentUrl,
          paymentUrl: paymentUrl,
          ...json 
        });
      } else {
        console.error(`[ZapUPI Create Order] Gateway error:`, JSON.stringify(json));
        return res.status(400).json({ 
          success: false, 
          error: json.msg || json.message || "Payment initiation failed at gateway" 
        });
      }
    } catch (err: any) {
      console.error(`[ZapUPI Create Order] Gateway request failed:`, err.response?.data || err.message);
      return res.status(502).json({ 
        success: false, 
        error: "Payment gateway unreachable: " + (err.response?.data?.message || err.message) 
      });
    }
  } catch (error: any) {
    console.error("[ZapUPI Create Order] Internal Exception:", error.message);
    res.status(500).json({ success: false, error: "Internal server error: " + error.message });
  }
}
