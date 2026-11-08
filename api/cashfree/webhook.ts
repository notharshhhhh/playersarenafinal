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

  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      message: "Cashfree webhook endpoint is active and listening for POST notifications."
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  let db: any = null;
  let FieldValueObj: any = null;
  try {
    const admin = getFirebaseAdmin();
    db = admin.db;
    FieldValueObj = admin.FieldValue;
  } catch (adminErr: any) {
    console.warn("[Cashfree Webhook] Firebase Admin init notice:", adminErr?.message);
  }

  try {
    const signature = req.headers["x-webhook-signature"] as string;
    const timestamp = req.headers["x-webhook-timestamp"] as string;
    const rawBody = req.body?.__rawBody || JSON.stringify(req.body);

    if (!signature || !timestamp) {
      return res.status(400).json({ success: false, error: "Missing webhook headers" });
    }

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
       return res.status(400).json({ success: false, error: "Gateway unconfigured" });
    }
    
    const { data: eventData, type } = req.body || {};
    const orderId = eventData?.order?.order_id;
    
    const isProd = isProdEnv || (clientId && !clientId.includes('TEST'));

    (Cashfree as any).XClientId = clientId;
    (Cashfree as any).XClientSecret = clientSecret;
    (Cashfree as any).XEnvironment = isProd ? (Cashfree as any).Environment.PRODUCTION : (Cashfree as any).Environment.SANDBOX;

    try {
      (Cashfree as any).PGVerifyWebhookSignature(signature, rawBody, timestamp);
    } catch (err) {
      console.warn("[Cashfree Webhook] Signature verification notice:", err);
    }
    
    if (!orderId) return res.status(200).send("OK");

    if (!db || !FieldValueObj) {
      return res.status(200).send("OK - DB Unavailable");
    }

    const userId = eventData.customer_details.customer_id;
    const amount = Number(eventData.payment.payment_amount);
    const paymentId = eventData.payment.cf_payment_id;

    const transRef = db.collection('transactions').doc(orderId);
    const userRef = db.collection('users').doc(userId);

    if (type === "PAYMENT_SUCCESS_WEBHOOK") {
      await db.runTransaction(async (t: any) => {
        const transDoc = await t.get(transRef);
        if (transDoc.exists && transDoc.data()?.status === 'completed') return;

        t.set(transRef, {
          userId: userId,
          type: 'deposit',
          amount: amount,
          status: 'completed',
          title: 'Deposit via Cashfree',
          paymentId: paymentId,
          gateway: 'cashfree',
          updatedAt: FieldValueObj.serverTimestamp(),
          createdAt: transDoc.exists ? transDoc.data()?.createdAt : FieldValueObj.serverTimestamp()
        }, { merge: true });

        t.update(userRef, {
          'wallet.deposit': FieldValueObj.increment(amount),
          'stats.totalDeposited': FieldValueObj.increment(amount)
        });
      });
      console.log(`[Cashfree Webhook] Order ${orderId} processed for user ${userId}`);
    }

    res.status(200).send("OK");
  } catch (error: any) {
    console.error("[Cashfree Webhook] Error:", error.message);
    res.status(500).send("Internal Error");
  }
}
