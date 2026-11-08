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

  console.log("[ZapUPI Status Check] Route hit");

  let db: any = null;
  let FieldValueObj: any = null;
  try {
    const admin = getFirebaseAdmin();
    db = admin.db;
    FieldValueObj = admin.FieldValue;
  } catch (adminErr: any) {
    console.warn("[ZapUPI Status Check] Firebase Admin init notice:", adminErr?.message);
  }

  try {
    const { order_id } = req.body || {};
    if (!order_id) {
      console.warn("[ZapUPI Status Check] Missing order_id");
      return res.status(400).json({ success: false, error: "Missing order_id" });
    }

    let transData: any = {};
    let transRef: any = null;

    if (db) {
      // 1. Fetch transaction from Firestore to verify ownership and amount
      transRef = db.collection('transactions').doc(order_id);
      const transDoc = await transRef.get();
      
      if (transDoc.exists) {
        transData = transDoc.data() || {};
        if (transData.status === 'completed') {
          console.log(`[ZapUPI Status Check] Order ${order_id} already completed`);
          return res.json({ success: true, status: 'success', alreadyProcessed: true });
        }
      }
    }

    const userId = transData.userId;
    const originalAmount = transData.amount;

    // 2. Fetch API Key
    let apiKey = process.env.ZAPUPI_API_KEY;
    if (db) {
      try {
        const configDoc = await db.collection('paymentSettings').doc('zapupi').get();
        if (configDoc.exists && configDoc.data()?.isActive) {
          apiKey = configDoc.data()?.apiKey || apiKey;
        }
      } catch (e) {}
    }

    // 3. Poll ZapUPI Gateway
    const apiBase = (process.env.ZAPUPI_BASE_URL || "https://pay.zapupi.com").replace(/\/$/, "");
    const hosts = [apiBase, "https://pay.zapupi.com", "https://api.zapupi.com", "https://p1.zapupi.com"].filter(Boolean);
    const paths = ["/api/get_order", "/api/get-order", "/api/v2/get_order", "/api/v1/get_order"];

    let verifiedData: any = null;
    let finalStatus = 'pending';

    console.log(`[ZapUPI Status Check] Polling gateway for ${order_id}...`);

    outer: for (const host of hosts) {
      for (const path of paths) {
        const verifyUrl = `${host}${path}`;
        try {
          const verifyRes = await axios.post(verifyUrl, {
            zap_key: apiKey,
            api_key: apiKey,
            order_id: order_id
          }, { 
            headers: { 'Content-Type': 'application/json' },
            timeout: 8000 
          });

          const vData = verifyRes.data || {};
          const rawStatus = String(vData.status || vData.order_status || vData.orderStatus || '').toLowerCase();
          const rawMsg = String(vData.msg || vData.message || vData.status_msg || '').toLowerCase();
          
          console.log(`[ZapUPI Status Check] Gateway response (${verifyUrl}): ${rawStatus} | ${rawMsg}`);

          // Flexible success detection
          const isSuccess = 
            ['success', 'completed', 'paid', 'transaction successful'].includes(rawStatus) ||
            rawMsg.includes('success') || 
            rawMsg.includes('paid') ||
            rawMsg.includes('successful');

          if (isSuccess) {
            finalStatus = 'success';
            verifiedData = vData;
            break outer;
          } else if (['failed', 'failure', 'canceled', 'cancelled'].includes(rawStatus)) {
            finalStatus = 'failed';
            verifiedData = vData;
            break outer;
          }
        } catch (err: any) {}
      }
    }

    // 4. Update Wallet if success
    if (finalStatus === 'success' && verifiedData && db && transRef && userId && FieldValueObj) {
      console.log(`[ZapUPI Status Check] Payment verified. Processing wallet credit for ${userId}`);
      
      const gatewayAmount = Number(verifiedData.amount || verifiedData.order_amount || verifiedData.pay_amount || originalAmount || 0);
      const txId = verifiedData.txn_id || verifiedData.tx_id || order_id;
      const utr = verifiedData.utr || '';

      await db.runTransaction(async (t: any) => {
        const freshTransDoc = await t.get(transRef);
        if (freshTransDoc.exists && freshTransDoc.data()?.status === 'completed') return;

        const userRef = db.collection('users').doc(userId);
        
        t.update(transRef, {
          status: 'completed',
          amount: gatewayAmount,
          paymentId: txId,
          utr: utr,
          updatedAt: FieldValueObj.serverTimestamp()
        });

        t.update(userRef, {
          'wallet.deposit': FieldValueObj.increment(gatewayAmount),
          'stats.totalDeposited': FieldValueObj.increment(gatewayAmount)
        });
      });

      console.log(`[ZapUPI Status Check] Wallet updated successfully for user ${userId}`);
      return res.json({ success: true, status: 'success', detail: verifiedData });
    }

    if (finalStatus === 'failed' && db && transRef && FieldValueObj) {
       await transRef.update({ status: 'failed', updatedAt: FieldValueObj.serverTimestamp() });
       return res.json({ success: false, status: 'failed', detail: verifiedData });
    }

    res.json({ success: true, status: finalStatus, detail: verifiedData });
  } catch (error: any) {
    console.error("[ZapUPI Status Check] Internal Error:", error.message);
    res.status(500).json({ success: false, error: "Internal server error: " + error.message });
  }
}
