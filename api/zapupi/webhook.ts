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

  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      message: "ZapUPI webhook endpoint is active and listening for POST notifications."
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // JSON Safety: Check if body is valid
  if (!req.body || typeof req.body !== 'object') {
    console.error("[ZapUPI Webhook] Invalid request body");
    return res.status(400).json({ success: false, error: "Invalid body" });
  }

  let db: any = null;
  let FieldValueObj: any = null;
  try {
    const admin = getFirebaseAdmin();
    db = admin.db;
    FieldValueObj = admin.FieldValue;
  } catch (adminErr: any) {
    console.warn("[ZapUPI Webhook] Firebase Admin init notice:", adminErr?.message);
  }

  try {
    console.log(`[ZapUPI Webhook] Received body:`, JSON.stringify(req.body));
    
    const { 
      status, 
      order_id, 
      amount, 
      pay_amount, 
      txn_id, 
      utr 
    } = req.body;

    const orderIdFinal = order_id || req.body.orderId || req.body.client_order_id;
    const amountFinal = pay_amount || amount || req.body.amount || req.body.order_amount;
    const statusFinal = status || req.body.orderStatus || req.body.order_status;
    const transactionId = txn_id || req.body.tx_id || req.body.txn_id || orderIdFinal;
    const utrFinal = utr || req.body.bank_ref_num || '';

    if (!orderIdFinal) {
      console.warn("[ZapUPI Webhook] Missing order_id in payload");
      return res.status(400).json({ success: false, error: "Missing order_id" });
    }

    if (!db || !FieldValueObj) {
      console.warn("[ZapUPI Webhook] Firestore DB unavailable, returning 200");
      return res.status(200).send("OK - DB Unavailable");
    }

    // 1. Fetch transaction from DB
    const transRef = db.collection('transactions').doc(orderIdFinal);
    const transDoc = await transRef.get();
    
    if (!transDoc.exists) {
      console.warn(`[ZapUPI Webhook] Order not found in DB: ${orderIdFinal}. Returning 200.`);
      return res.status(200).send("OK - Order Not Found");
    }

    const transData = transDoc.data() || {};
    if (transData.status === 'completed') {
      console.log(`[ZapUPI Webhook] Order ${orderIdFinal} already completed`);
      return res.status(200).send("OK - Already Processed");
    }

    const userId = transData.userId;
    const expectedAmount = transData.amount;

    // 2. Multi-point Verification
    let isVerified = false;
    let gatewayReportedAmount: number | null = null; // amount confirmed by ZapUPI's own API (not the request body)
    let apiKey = process.env.ZAPUPI_API_KEY;
    try {
      const configDoc = await db.collection('paymentSettings').doc('zapupi').get();
      if (configDoc.exists && configDoc.data()?.isActive) {
        apiKey = configDoc.data()?.apiKey || apiKey;
      }
    } catch (e) {}

    const rawStatus = String(statusFinal || '').toLowerCase();
    
    // Check if status in body is clearly success
    const isBodySuccess = ['success', 'completed', 'paid', 'transaction successful'].includes(rawStatus);

    if (isBodySuccess && apiKey) {
      // Cross-verify with API for security
      const apiBase = (process.env.ZAPUPI_BASE_URL || "https://pay.zapupi.com").replace(/\/$/, "");
      const hosts = [apiBase, "https://pay.zapupi.com", "https://api.zapupi.com"].filter(Boolean);
      const paths = ["/api/get_order", "/api/get-order", "/api/v2/get_order", "/api/v1/get_order"];
      
      outer: for (const host of hosts) {
        for (const path of paths) {
          const verifyUrl = `${host}${path}`;
          try {
            const verifyRes = await axios.post(verifyUrl, {
              zap_key: apiKey,
              api_key: apiKey,
              order_id: orderIdFinal
            }, { 
              headers: { 'Content-Type': 'application/json' },
              timeout: 8000 
            });

            const vData = verifyRes.data || {};
            const vStatus = String(vData.status || vData.order_status || vData.orderStatus || '').toLowerCase();
            const vMsg = String(vData.msg || vData.message || vData.status_msg || '').toLowerCase();

            if (['success', 'completed', 'paid', 'transaction successful'].includes(vStatus) || vMsg.includes('success')) {
              isVerified = true;
              const apiAmt = Number(vData.amount || vData.order_amount || vData.pay_amount || 0);
              if (Number.isFinite(apiAmt) && apiAmt > 0) gatewayReportedAmount = apiAmt;
              console.log(`[ZapUPI Webhook] API verified success via ${verifyUrl}`);
              break outer;
            }
          } catch (err) {}
        }
      }
    } else if (isBodySuccess) {
      // SECURITY: the webhook body can be forged by anyone, so without an API key we cannot verify -> do not credit.
      console.error("[ZapUPI Webhook] ZapUPI API key missing; refusing to credit an unverified webhook for order " + orderIdFinal);
      return res.status(200).send("OK - Not Verified");
    }

    // 3. Process Wallet Credit
    if (isVerified) {
      // SECURITY: credit the amount saved on our own order. The request-body amount is ignored.
      const verifiedAmount = Number(expectedAmount || 0);
      if (!userId || !Number.isFinite(verifiedAmount) || verifiedAmount <= 0) {
        console.error(`[ZapUPI Webhook] Order ${orderIdFinal} has no valid stored userId/amount; not crediting.`);
        return res.status(200).send("OK - Invalid Order");
      }
      if (gatewayReportedAmount !== null && Math.abs(gatewayReportedAmount - verifiedAmount) > 0.5) {
        console.error(`[ZapUPI Webhook] Amount mismatch for ${orderIdFinal}: order ₹${verifiedAmount} vs gateway ₹${gatewayReportedAmount}. Not crediting.`);
        await transRef.update({ amountMismatch: true, gatewayAmount: gatewayReportedAmount, updatedAt: FieldValueObj.serverTimestamp() });
        return res.status(200).send("OK - Amount Mismatch");
      }
      console.log(`[ZapUPI Webhook] Verification passed. Crediting user ${userId}: ₹${verifiedAmount}`);

      await db.runTransaction(async (t: any) => {
        const freshTransDoc = await t.get(transRef);
        if (freshTransDoc.exists && freshTransDoc.data()?.status === 'completed') return;

        const userRef = db.collection('users').doc(userId);

        t.update(transRef, {
          status: 'completed',
          paymentId: transactionId,
          utr: utrFinal,
          updatedAt: FieldValueObj.serverTimestamp()
        });

        t.update(userRef, {
          'wallet.deposit': FieldValueObj.increment(verifiedAmount),
          'stats.totalDeposited': FieldValueObj.increment(verifiedAmount)
        });
      });

      console.log(`[ZapUPI Webhook] Wallet updated successfully for ${orderIdFinal}`);
    } else if (['failed', 'failure', 'canceled', 'cancelled'].includes(rawStatus)) {
      console.log(`[ZapUPI Webhook] Order ${orderIdFinal} failed at gateway`);
      await transRef.update({ status: 'failed', updatedAt: FieldValueObj.serverTimestamp() });
    }

    return res.status(200).send("OK");
  } catch (error: any) {
    console.error("[ZapUPI Webhook] Fatal Error:", error.message);
    return res.status(500).send("Internal Server Error");
  }
}
