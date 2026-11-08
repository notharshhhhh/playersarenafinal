import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { Cashfree } from "cashfree-pg";
import { initializeApp as initializeFrontendApp } from "firebase/app";
import { 
  getFirestore as getFrontendFirestore, 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc 
} from "firebase/firestore";
import { initializeApp, getApps, getApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import cors from "cors";
import crypto from "crypto";
import dotenv from "dotenv";
import fs from "fs";
import axios from "axios";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Firebase Config
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(__dirname, "firebase-applet-config.json"), "utf8"));

// Set project ID in environment if not present
const preferredProjectId = firebaseConfig.projectId;
if (!process.env.GOOGLE_CLOUD_PROJECT && preferredProjectId) {
  process.env.GOOGLE_CLOUD_PROJECT = preferredProjectId;
}

// Initialize Firebase Admin
let app: any;
try {
  if (getApps().length === 0) {
    app = initializeApp({
      projectId: preferredProjectId
    });
    console.log(`[Firebase Admin] Initialized with Project ID: ${preferredProjectId}`);
  } else {
    app = getApp();
  }
} catch (e: any) {
  console.warn("[Firebase Admin] Initialization failed, falling back to default:", e.message);
  try {
    app = initializeApp();
  } catch (e2: any) {
    console.error("[Firebase Admin] Critical: All initialization attempts failed:", e2.message);
  }
}

// Initialize Frontend/Client SDK as Fallback (Subject to rules, but bypasses IAM issues)
const frontendApp = initializeFrontendApp(firebaseConfig);
const frontendFirestore = getFrontendFirestore(frontendApp, firebaseConfig.firestoreDatabaseId);

// Get reference to the specific Firestore database
let firestore: any;
const databaseId = firebaseConfig.firestoreDatabaseId || "(default)";
try {
  // Use the app and databaseId explicitly
  firestore = getFirestore(app, databaseId);
  console.log(`[Firebase Admin] Firestore instance created for database: ${databaseId}`);
} catch (e: any) {
  console.error("[Firebase Admin] Critical Firestore Init Error:", e.message);
  // Last ditch attempt
  try {
    firestore = getFirestore();
  } catch (e2) {
    console.error("[Firebase Admin] Firestore fallback failed");
  }
}

// Self-seeding Admins and Initial Config
async function seedInitialData() {
  if (!firestore) {
    console.warn("[Firebase Admin] Skipping seeding: Firestore not initialized");
    return;
  }

  try {
    // Basic connectivity test
    console.log(`[Firebase Admin] Testing connectivity to database: ${databaseId}...`);
    // Attempt a lightweight read
    await firestore.collection('paymentSettings').limit(1).get();
    console.log("[Firebase Admin] Connectivity successful.");
  } catch (err: any) {
    // Fail gracefully if permissions are missing
    if (err.message.includes('PERMISSION_DENIED')) {
      console.info("[Firebase Admin] DB connectivity restricted (Permission Denied). Environment variable fallbacks will be used.");
    } else {
      console.warn(`[Firebase Admin] Connectivity test suppressed:`, err.message);
    }
    return; // Stop seeding if connectivity fails
  }
  
  try {
    const adminEmails = [
      'playersarena.site@gmail.com',
      'tournament909@gmail.com',
      'harsha.cpr001@gmail.com',
      'admin@khelgalli.com',
      'chouhanadarsh99@gmail.com',
      'mahendrathakur9009@gmail.com',
      'qupagaming@gmail.com',
      'mahendrar9009@gmail.com'
    ];
    
    const adminUids = [
      'XoXyXcnrlzOaMIKKolXnU3mT9xn1'
    ];

    console.log("[Firebase Admin] Seeding admin permissions...");
    
    // Seed by Email
    for (const email of adminEmails) {
      await firestore.collection('admins').doc(email).set({ 
        role: 'super_admin', 
        email: email.toLowerCase(),
        updatedAt: FieldValue.serverTimestamp() 
      }, { merge: true });
      await firestore.collection('admins').doc(email.toLowerCase()).set({ 
        role: 'super_admin', 
        email: email.toLowerCase(),
        updatedAt: FieldValue.serverTimestamp() 
      }, { merge: true });
    }

    // Seed by UID (more reliable for rules)
    for (const uid of adminUids) {
      await firestore.collection('admins').doc(uid).set({ 
        role: 'super_admin', 
        updatedAt: FieldValue.serverTimestamp() 
      }, { merge: true });
    }

    // Provision or update default admin account in Firebase Auth
    try {
      const adminAuth = getAdminAuth(app);
      const targetEmail = 'playersarena.site@gmail.com';
      const targetPassword = 'loveanu@harsh';
      let adminUid = '';

      try {
        const existingUser = await adminAuth.getUserByEmail(targetEmail);
        adminUid = existingUser.uid;
        await adminAuth.updateUser(adminUid, {
          password: targetPassword,
          emailVerified: true
        });
        console.log(`[Firebase Admin] Default admin ${targetEmail} password updated.`);
      } catch (userErr: any) {
        if (userErr.code === 'auth/user-not-found') {
          const newUser = await adminAuth.createUser({
            email: targetEmail,
            password: targetPassword,
            displayName: 'SUPER ADMIN',
            emailVerified: true
          });
          adminUid = newUser.uid;
          console.log(`[Firebase Admin] Created default admin ${targetEmail} (UID: ${adminUid}).`);
        } else {
          console.warn("[Firebase Admin] Auth note:", userErr.message);
        }
      }

      if (adminUid) {
        await firestore.collection('users').doc(adminUid).set({
          username: 'SUPER ADMIN',
          email: targetEmail,
          phone: '9999999999',
          isAdmin: true,
          wallet: { deposit: 0, winnings: 0, bonus: 0 },
          isKycVerified: true,
          stats: { matchesPlayed: 0, totalWins: 0, totalKills: 0, totalWinnings: 0 },
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });

        await firestore.collection('admins').doc(adminUid).set({
          role: 'super_admin',
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
      }
    } catch (authProvisionErr: any) {
      console.warn("[Firebase Admin] Auth admin provisioning notice:", authProvisionErr.message);
    }

    // Ensure Cashfree structure exists
    const cashfreeDoc = await firestore.collection('paymentSettings').doc('cashfree').get();
    if (!cashfreeDoc.exists) {
      await firestore.collection('paymentSettings').doc('cashfree').set({
        name: 'Cashfree PG',
        id: 'cashfree',
        isActive: false, // Deactivated in favor of ZapUPI
        isProduction: process.env.CASHFREE_ENV === 'PRODUCTION',
        apiKey: process.env.CASHFREE_CLIENT_ID || '',
        secretKey: process.env.CASHFREE_CLIENT_SECRET || '',
        webhookSecret: process.env.CASHFREE_WEBHOOK_SECRET || '',
        updatedAt: FieldValue.serverTimestamp()
      });
      console.log("[Firebase Admin] Seeded default Cashfree setting (Inactive)");
    }

    const zapupiDoc = await firestore.collection('paymentSettings').doc('zapupi').get();
    if (!zapupiDoc.exists) {
      await firestore.collection('paymentSettings').doc('zapupi').set({
        name: 'ZapUPI',
        id: 'zapupi',
        isActive: false,
        isProduction: process.env.ZAPUPI_ENV === 'LIVE',
        apiKey: process.env.ZAPUPI_API_KEY || '',
        updatedAt: FieldValue.serverTimestamp()
      });
      console.log("[Firebase Admin] Seeded default ZapUPI setting");
    }
  } catch (err) {
    console.error("[Firebase Admin] Seeding failed:", err);
  }
}

seedInitialData();

async function startServer() {
  const serverApp = express();
  const PORT = 3000;

  serverApp.use(cors());
  
  // API Request Logger
  serverApp.use("/api/*", (req, res, next) => {
    console.log(`[API Request] ${req.method} ${req.path}`);
    next();
  });
  
  // Ensure uploads directory exists
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  if (!fs.existsSync(uploadsDir)) {
    try {
      fs.mkdirSync(uploadsDir, { recursive: true });
    } catch (e) {
      console.warn("[Uploads] Could not create public/uploads folder:", e);
    }
  }

  // Serve uploads statically
  serverApp.use("/uploads", express.static(uploadsDir));
  serverApp.use("/public/uploads", express.static(uploadsDir));
  
  // Middleware to capture raw body for webhook verification and support large uncompressed image uploads
  serverApp.use(express.json({
    limit: "50mb",
    verify: (req: any, res, buf) => {
      req.rawBody = buf.toString();
    }
  }));
  serverApp.use(express.urlencoded({ limit: "50mb", extended: true }));

// Helper to get active gateway config with environment variable fallback
  let lastAdminErrorTime = 0;
  async function getActiveGateway() {
    // 1. Prepare fallback config from environment variables
    const fallbackConfig = {
      id: "cashfree",
      name: "Cashfree (Fallback)",
      isActive: true,
      apiKey: process.env.CASHFREE_CLIENT_ID,
      secretKey: process.env.CASHFREE_CLIENT_SECRET,
      webhookSecret: process.env.CASHFREE_WEBHOOK_SECRET || process.env.CASHFREE_CLIENT_SECRET,
      isProduction: process.env.CASHFREE_ENV === "PRODUCTION"
    };

    const zapupiConfig = {
      id: "zapupi",
      name: "ZapUPI",
      isActive: true,
      apiKey: process.env.ZAPUPI_API_KEY,
      isProduction: process.env.ZAPUPI_ENV === "LIVE"
    };

    try {
      const snap = await firestore.collection('paymentSettings').where('isActive', '==', true).limit(1).get();
      if (!snap.empty) {
        return { id: snap.docs[0].id, ...snap.docs[0].data() } as any;
      }
      // If paymentSettings docs exist in Firestore and none are active, return null (Manual Payment Mode)
      const allSnap = await firestore.collection('paymentSettings').limit(5).get();
      if (!allSnap.empty) {
        return null;
      }
    } catch (adminErr: any) {
      if (!adminErr.message?.includes('PERMISSION_DENIED')) {
        const now = Date.now();
        if (now - lastAdminErrorTime > 300000) {
           console.warn("[Firebase Admin] Payment settings fetch restricted:", adminErr.message);
           lastAdminErrorTime = now;
        }
      }
    }

    // Try Client SDK as fallback
    try {
      const q = query(collection(frontendFirestore, 'paymentSettings'), where('isActive', '==', true));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return { id: snap.docs[0].id, ...snap.docs[0].data() } as any;
      }
      const allSnap = await getDocs(collection(frontendFirestore, 'paymentSettings'));
      if (!allSnap.empty) {
        return null;
      }
    } catch (clientErr) {
      // Ignore client SDK fallback errors
    }

    return null;
  }

  // Server-side Admin Action Endpoints (Bypass client-side permission restrictions)
  serverApp.post("/api/admin/approve-deposit", async (req, res) => {
    try {
      const { txId, userId, amount } = req.body;
      if (!txId || !userId || !amount || Number(amount) <= 0) {
        return res.status(400).json({ error: "Missing txId, userId, or valid amount" });
      }
      const depositAmount = Number(amount);

      if (firestore) {
        const transRef = firestore.collection('transactions').doc(txId);
        const userRef = firestore.collection('users').doc(userId);
        await firestore.runTransaction(async (t: any) => {
          const transDoc = await t.get(transRef);
          if (transDoc.exists && transDoc.data()?.status === 'completed') {
            return;
          }
          t.set(transRef, {
            status: 'completed',
            approvedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          }, { merge: true });
          t.set(userRef, {
            wallet: {
              deposit: FieldValue.increment(depositAmount)
            }
          }, { merge: true });
        });
        return res.json({ success: true });
      }
      return res.status(500).json({ error: "Firestore Admin not initialized" });
    } catch (err: any) {
      console.error("[Admin API] Approve deposit error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  serverApp.post("/api/admin/reject-deposit", async (req, res) => {
    try {
      const { txId } = req.body;
      if (!txId) return res.status(400).json({ error: "Missing txId" });
      if (firestore) {
        await firestore.collection('transactions').doc(txId).set({
          status: 'failed',
          rejectedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        return res.json({ success: true });
      }
      return res.status(500).json({ error: "Firestore Admin not initialized" });
    } catch (err: any) {
      console.error("[Admin API] Reject deposit error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  serverApp.post("/api/admin/approve-withdrawal", async (req, res) => {
    try {
      const { txId } = req.body;
      if (!txId) return res.status(400).json({ error: "Missing txId" });
      if (firestore) {
        await firestore.collection('transactions').doc(txId).set({
          status: 'completed',
          approvedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        return res.json({ success: true });
      }
      return res.status(500).json({ error: "Firestore Admin not initialized" });
    } catch (err: any) {
      console.error("[Admin API] Approve withdrawal error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  serverApp.post("/api/admin/reject-withdrawal", async (req, res) => {
    try {
      const { txId, userId, amount } = req.body;
      if (!txId) return res.status(400).json({ error: "Missing txId" });
      const refundAmount = Number(amount || 0);
      if (firestore) {
        const transRef = firestore.collection('transactions').doc(txId);
        await firestore.runTransaction(async (t: any) => {
          const transDoc = await t.get(transRef);
          if (transDoc.exists && transDoc.data()?.status === 'failed') {
            return;
          }
          t.set(transRef, {
            status: 'failed',
            rejectedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
          }, { merge: true });
          if (userId && refundAmount > 0) {
            const userRef = firestore.collection('users').doc(userId);
            t.set(userRef, {
              wallet: {
                winnings: FieldValue.increment(refundAmount)
              }
            }, { merge: true });
          }
        });
        return res.json({ success: true });
      }
      return res.status(500).json({ error: "Firestore Admin not initialized" });
    } catch (err: any) {
      console.error("[Admin API] Reject withdrawal error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  });

  // Uncompressed Original-Quality Image Upload Endpoint
  serverApp.post("/api/upload-image", async (req, res) => {
    try {
      const { imageBase64, filename } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: "Missing image data" });
      }

      // If ImgBB API Key is configured, upload original high-res image to ImgBB
      const imgbbKey = process.env.IMGBB_API_KEY || process.env.IMAGEBB_API_KEY || process.env.VITE_IMGBB_API_KEY;
      if (imgbbKey) {
        try {
          const rawBase64 = imageBase64.includes(",") ? imageBase64.split(",")[1] : imageBase64;
          const formData = new URLSearchParams();
          formData.append("image", rawBase64);
          
          const imgbbRes = await axios.post(`https://api.imgbb.com/1/upload?key=${imgbbKey}`, formData.toString(), {
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            timeout: 30000
          });
          if (imgbbRes.data?.data?.url) {
            console.log(`[Upload] Image uploaded to ImgBB at full original quality: ${imgbbRes.data.data.url}`);
            return res.json({ url: imgbbRes.data.data.url });
          }
        } catch (imgbbErr: any) {
          console.warn("[Upload] ImgBB upload failed, saving to local static storage:", imgbbErr.message);
        }
      }

      // Save raw uncompressed image directly to uploads folder
      let ext = "png";
      let base64Data = imageBase64;
      if (imageBase64.startsWith("data:")) {
        const match = imageBase64.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
        if (match) {
          ext = match[1] === "jpeg" ? "jpg" : match[1];
          base64Data = match[2];
        }
      } else if (filename && filename.includes(".")) {
        ext = filename.split(".").pop().toLowerCase();
      }

      const safeName = `match_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
      const filePath = path.join(uploadsDir, safeName);
      
      fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
      const directUrl = `/uploads/${safeName}`;
      console.log(`[Upload] Image saved locally at 100% original quality: ${directUrl}`);
      
      return res.json({ url: directUrl });
    } catch (error: any) {
      console.error("[Upload] Error saving uncompressed image:", error.message);
      return res.status(500).json({ error: "Failed to upload image" });
    }
  });

  // Cashfree Order Creation
  serverApp.post("/api/cashfree/create-order", async (req, res) => {
    try {
      console.log("Creating Cashfree order - Route hit successfully");
      const { amount, userId, customerName, customerEmail, customerPhone } = req.body;
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: "Invalid amount" });
      }

      const config: any = await getActiveGateway();
      
      const isCashfree = config && (config.id === 'cashfree' || config.name?.toLowerCase().includes('cashfree'));
      
      if (!config || !isCashfree) {
        return res.status(400).json({ error: "Cashfree is not configured or active. Go to Admin -> Payment -> Activate Cashfree." });
      }

      const clientId = config.apiKey || process.env.CASHFREE_CLIENT_ID;
      const clientSecret = config.secretKey || process.env.CASHFREE_CLIENT_SECRET;
      
      if (!clientId || !clientSecret) {
        console.error("[Cashfree] Missing credentials in Firestore config!");
        return res.status(500).json({ error: "Cashfree credentials are missing in Admin settings." });
      }

      const isProd = config.isProduction || (clientId && !clientId.includes('TEST'));
      const environment = isProd ? "PRODUCTION" : "SANDBOX";

      (Cashfree as any).XClientId = clientId;
      (Cashfree as any).XClientSecret = clientSecret;
      (Cashfree as any).XEnvironment = isProd ? (Cashfree as any).Environment.PRODUCTION : (Cashfree as any).Environment.SANDBOX;

      // Determine base URL, prioritizing APP_URL then Vercel's x-forwarded-host
      let baseUrlFull = process.env.APP_URL;
      
      if (!baseUrlFull) {
        const publicHost = req.headers['x-forwarded-host'] || req.headers.host;
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        baseUrlFull = `${protocol}://${publicHost}`;
      }
      
      // Ensure no trailing slash
      baseUrlFull = baseUrlFull.replace(/\/$/, "");

      const orderId = `order_${Date.now()}_${userId}`;
      
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

      console.log(`[Cashfree V5] Creating order: ${orderId} | Env: ${environment}`);
      const response = await (Cashfree as any).PGCreateOrder("2023-08-01", requestData);
      console.log(`[Cashfree V5] Order created successfully.`);
      res.json(response.data);
    } catch (error: any) {
      console.error("[Cashfree] Order Creation Error:", error.response?.data || error.message);
      res.status(500).json({ error: error.response?.data?.message || error.message || "Failed to create order" });
    }
  });

  // ZapUPI Order Creation
  serverApp.post("/api/zapupi/create-order", async (req, res) => {
    console.log("Creating ZapUPI order");
    try {
      const { amount, userId, customerName: reqName, customerEmail: reqEmail, customerPhone: reqPhone } = req.body;
      
      if (!amount || Number(amount) <= 0) {
        return res.status(400).json({ success: false, error: "Invalid amount" });
      }

      const config: any = await getActiveGateway();
      const apiKey = config?.apiKey || process.env.ZAPUPI_API_KEY;

      if (!apiKey) {
        return res.status(400).json({ success: false, error: "ZapUPI API Key is missing. Add it in Admin Panel -> Payment Gateways -> ZapUPI and switch the gateway ON." });
      }

      // Fetch user profile from Firestore for accurate metadata
      let customerName = reqName || "Player";
      let customerEmail = reqEmail || "player@game.com";
      let customerPhone = reqPhone || "9999999999";

      if (userId) {
        try {
          const userDoc = await firestore.collection('users').doc(userId).get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            customerName = userData.username || customerName;
            customerEmail = userData.email || customerEmail;
            customerPhone = userData.mobile || userData.phone || customerPhone;
          }
        } catch (err) {
          // Use request body metadata
        }
      }

      const orderId = `zap_${Date.now()}_${userId}`;
      
      // Determine base URL
      let baseUrlFull = process.env.APP_URL;
      if (!baseUrlFull) {
        const publicHost = req.headers['x-forwarded-host'] || req.headers.host;
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        baseUrlFull = `${protocol}://${publicHost}`;
      }
      baseUrlFull = baseUrlFull.replace(/\/$/, "");

      const redirectTarget = `${baseUrlFull}/wallet?order_id=${orderId}&gateway=zapupi`;

      // Record pending order in Firestore transactions collection (Status = PENDING, wallet is NOT credited yet!)
      try {
        await firestore.collection('transactions').doc(orderId).set({
          userId: userId,
          userName: customerName,
          userEmail: customerEmail,
          type: 'deposit',
          title: 'ZapUPI Gateway Deposit',
          gateway: 'zapupi',
          orderId: orderId,
          amount: Number(amount),
          status: 'pending',
          date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
          createdAt: FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (e) {
        // Client will also ensure pending record exists
      }

      const payload: Record<string, any> = {
        token_key: apiKey,
        zap_key: apiKey,
        api_key: apiKey,
        order_id: orderId,
        client_order_id: orderId,
        amount: String(amount),
        txn_amount: String(amount),
        customer_name: customerName,
        customer_email: customerEmail,
        customer_mobile: String(customerPhone || "9999999999").replace(/\D/g, '').slice(-10) || "9999999999",
        cust_mobile: String(customerPhone || "9999999999").replace(/\D/g, '').slice(-10) || "9999999999",
        cust_email: customerEmail,
        webhook_url: `${baseUrlFull}/api/zapupi/webhook`,
        callback_url: redirectTarget,
        success_url: redirectTarget,
        failed_url: `${baseUrlFull}/wallet?payment=failed&order_id=${orderId}`,
        timeout_url: `${baseUrlFull}/wallet?payment=timeout&order_id=${orderId}`,
        redirect_url: redirectTarget,
        return_url: redirectTarget,
        txn_note: `Wallet Deposit ${orderId}`,
        description: `Wallet Deposit - ${userId}`
      };

      const candidateUrls = [
        process.env.ZAPUPI_BASE_URL ? `${process.env.ZAPUPI_BASE_URL.replace(/\/$/, "")}/api/create-order` : null,
        "https://api.zapupi.com/api/create-order",
        "https://pay.zapupi.com/api/create-order",
        "https://zapupi.com/api/create-order"
      ].filter(Boolean) as string[];

      let result: any = null;
      let lastErrorMsg = "Could not connect to ZapUPI gateway";

      for (const zapUrl of candidateUrls) {
        try {
          console.log(`[ZapUPI] Trying endpoint: ${zapUrl} (JSON & Form-UrlEncoded)`);
          // Attempt 1: Form URL-Encoded (Standard ZapUPI PHP API format)
          const formParams = new URLSearchParams();
          Object.entries(payload).forEach(([k, v]) => {
            if (v !== undefined && v !== null) formParams.append(k, String(v));
          });

          const response = await axios.post(zapUrl, formParams.toString(), {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Accept': 'application/json'
            },
            timeout: 10000
          });

          const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
          const paymentUrl = data?.payment_url || data?.redirect_url || data?.paymentUrl || data?.data?.payment_url || data?.result?.payment_url;
          if (data && (data.status === 'success' || data.status === 'SUCCESS' || data.status === true || paymentUrl)) {
            result = { ...data, payment_url: paymentUrl };
            break;
          } else if (data?.message || data?.msg) {
            lastErrorMsg = data.message || data.msg;
          }
        } catch (err1: any) {
          // Attempt 2: JSON payload
          try {
            const responseJson = await axios.post(zapUrl, payload, {
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              timeout: 10000
            });
            const data = typeof responseJson.data === 'string' ? JSON.parse(responseJson.data) : responseJson.data;
            const paymentUrl = data?.payment_url || data?.redirect_url || data?.paymentUrl || data?.data?.payment_url || data?.result?.payment_url;
            if (data && (data.status === 'success' || data.status === 'SUCCESS' || data.status === true || paymentUrl)) {
              result = { ...data, payment_url: paymentUrl };
              break;
            } else if (data?.message || data?.msg) {
              lastErrorMsg = data.message || data.msg;
            }
          } catch (err2: any) {
            lastErrorMsg = err2.response?.data?.message || err2.response?.data?.msg || err2.message || lastErrorMsg;
          }
        }
      }

      if (!result || !result.payment_url) {
        return res.status(400).json({ error: `ZapUPI Order Error: ${lastErrorMsg}. Please verify your ZapUPI API Key in Admin -> Payment Gateways.` });
      }

      res.json({
        order_id: orderId,
        payment_url: result.payment_url,
        ...result
      });
    } catch (error: any) {
      console.error("[ZapUPI] Order Creation Exception:", error.message);
      res.status(400).json({ error: `Internal server error: ${error.message}` });
    }
  });

// Helper to handle ZapUPI Wallet Credit
async function processZapUPIPayment(orderId: string, gatewayAmount: any, transactionId: string, utr: string, environment?: string) {
  // SECURITY: only credit orders that WE created (stored transaction), using the stored userId and amount.
  // Nothing from the webhook/request body decides who gets credited or how much.
  const transRef = firestore.collection('transactions').doc(orderId);

  return await firestore.runTransaction(async (t: any) => {
    const transDoc = await t.get(transRef);

    if (!transDoc.exists) {
      console.error(`[ZapUPI] Refusing to credit unknown order: ${orderId}`);
      return { success: false, error: "Order not found" };
    }

    const stored = transDoc.data() || {};
    if (stored.status === 'completed') {
      return { alreadyProcessed: true };
    }

    const userId = stored.userId;
    const depositAmount = Number(stored.amount);
    if (!userId || isNaN(depositAmount) || depositAmount <= 0) {
      console.error(`[ZapUPI] Order ${orderId} has no valid stored userId/amount`);
      return { success: false, error: "Invalid stored order" };
    }

    // Amount confirmed by the ZapUPI API must match the amount of our order
    const reported = Number(gatewayAmount);
    if (Number.isFinite(reported) && reported > 0 && Math.abs(reported - depositAmount) > 0.5) {
      console.error(`[ZapUPI] Amount mismatch for ${orderId}: order ₹${depositAmount} vs gateway ₹${reported}. Not crediting.`);
      t.update(transRef, { amountMismatch: true, gatewayAmount: reported, updatedAt: FieldValue.serverTimestamp() });
      return { success: false, error: "Amount mismatch" };
    }

    const userRef = firestore.collection('users').doc(userId);

    t.set(transRef, {
      status: 'completed',
      paymentId: transactionId || orderId,
      utr: utr || '',
      gateway: 'zapupi',
      environment: environment || 'production',
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    t.update(userRef, {
      'wallet.deposit': FieldValue.increment(depositAmount),
      'stats.totalDeposited': FieldValue.increment(depositAmount)
    });

    return { success: true };
  });
}

  // ZapUPI Status Check Poll API
  serverApp.post("/api/zapupi/check-status", async (req, res) => {
    try {
      const { order_id } = req.body;
      if (!order_id) return res.status(400).json({ error: "Missing order_id" });

      const config: any = await getActiveGateway();
      const apiKey = config?.apiKey || process.env.ZAPUPI_API_KEY;
      
      const customBase = process.env.ZAPUPI_BASE_URL ? process.env.ZAPUPI_BASE_URL.replace(/\/$/, "") : null;
      const hosts = [
        customBase,
        "https://api.zapupi.com",
        "https://pay.zapupi.com",
        "https://zapupi.com"
      ].filter(Boolean);

      const paths = [
        "/api/order-status",
        "/api/get_order",
        "/api/get-order",
        "/api/v2/get_order",
        "/api/v1/get_order",
        "/api/v1/check_order"
      ];

      let status = 'pending';
      let verifiedData: any = null;

      console.log(`[ZapUPI Status Check] Polling for Order: ${order_id}`);

      outer: for (const host of hosts) {
        for (const path of paths) {
          const verifyUrl = `${host}${path}`;
          try {
            const formParams = new URLSearchParams();
            formParams.append("token_key", apiKey || "");
            formParams.append("zap_key", apiKey || "");
            formParams.append("order_id", order_id);

            const verifyRes = await axios.post(verifyUrl, formParams.toString(), {
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              timeout: 5000
            });

            const vData = verifyRes.data;
            const rawStatus = String(vData?.status || vData?.order_status || vData?.orderStatus || vData?.data?.status || '').toLowerCase();
            const txnStatus = String(vData?.txn_status || vData?.data?.txn_status || '').toLowerCase();
            
            if (rawStatus === 'success' || rawStatus === 'completed' || rawStatus === 'paid' || txnStatus === 'success' || txnStatus === 'completed') {
              status = 'success';
              verifiedData = vData?.data || vData;
              break outer;
            } else if (rawStatus === 'failed' || rawStatus === 'failure' || rawStatus === 'canceled' || rawStatus === 'cancelled' || txnStatus === 'failed') {
              status = 'failed';
              verifiedData = vData?.data || vData;
              break outer;
            }
          } catch (err: any) {
            // Silently try next endpoint
          }
        }
      }

      if (status === 'success' && verifiedData) {
        console.log(`[ZapUPI Status Check] Successful status confirmed for ${order_id}`);
        const amount = verifiedData.amount || verifiedData.order_amount || verifiedData.pay_amount || verifiedData.txn_amount;
        const txId = verifiedData.txn_id || verifiedData.tx_id || order_id;
        const utr = verifiedData.utr || verifiedData.bank_ref_num || '';
        
        try {
          const result = await processZapUPIPayment(order_id, amount, txId, utr);
          return res.json({ status: 'success', amount, txId, utr, alreadyProcessed: result.alreadyProcessed, detail: verifiedData });
        } catch (dbErr) {
          // Return verified status so client can also finalize if needed
          return res.json({ status: 'success', amount, txId, utr, detail: verifiedData });
        }
      }

      res.json({ status, detail: verifiedData });
    } catch (error: any) {
      console.error("[ZapUPI Status Check] Error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });

  // ZapUPI Webhook
  serverApp.post("/api/zapupi/webhook", async (req, res) => {
    try {
      console.log(`[ZapUPI Webhook] Raw Headers:`, JSON.stringify(req.headers));
      console.log(`[ZapUPI Webhook] Body Received:`, JSON.stringify(req.body));
      
      const { 
        status, 
        order_id, 
        amount, 
        pay_amount, 
        txn_id, 
        utr, 
        environment 
      } = req.body;

      const orderIdFinal = order_id || req.body.orderId;
      const amountFinal = pay_amount || amount || req.body.amount;
      const statusFinal = status || req.body.orderStatus;
      const transactionId = txn_id || req.body.tx_id;
      const utrFinal = utr || '';

      if (!orderIdFinal) {
        return res.status(400).json({ success: false, error: "Missing order_id" });
      }

      const config: any = await getActiveGateway();
      const apiKey = config?.apiKey || process.env.ZAPUPI_API_KEY;

      let isVerified = false;
      let verifiedAmount: any = undefined; // only ever set from ZapUPI's own API response, never from the request body
      let zapTransactionData: any = null;

      // SECURITY: the webhook body can be forged, so without an API key we cannot verify -> do not credit.
      if (!apiKey) {
        console.error(`[ZapUPI Webhook] API key missing; refusing to credit unverified webhook for ${orderIdFinal}`);
        return res.status(200).send("OK - Not Verified");
      }

      const customBase = process.env.ZAPUPI_BASE_URL ? process.env.ZAPUPI_BASE_URL.replace(/\/$/, "") : null;
      const hosts = [
        customBase,
        "https://pay.zapupi.com",
        "https://api.zapupi.com"
      ].filter(Boolean);

      const paths = [
        "/api/get_order",
        "/api/get-order",
        "/api/v2/get_order",
        "/api/v1/get_order"
      ];

      outer: for (const host of hosts) {
        for (const path of paths) {
          const verifyUrl = `${host}${path}`;
          try {
            const verifyRes = await axios.post(verifyUrl, {
              zap_key: apiKey,
              order_id: orderIdFinal
            }, { timeout: 8000 });

            const vData = verifyRes.data;
            const s = String(vData.status || vData.order_status || vData.orderStatus || '').toLowerCase();
            if (s === 'success' || s === 'completed' || s === 'paid') {
              isVerified = true;
              verifiedAmount = vData.amount || vData.order_amount || vData.pay_amount;
              zapTransactionData = vData;
              console.log(`[ZapUPI Webhook] Verified via ${verifyUrl}`);
              break outer;
            }
          } catch (err) {}
        }
      }

      // SECURITY: credit only when ZapUPI's API confirmed the payment (never on the request body's status alone)
      if (isVerified) {
        const result = await processZapUPIPayment(
          orderIdFinal, 
          verifiedAmount, 
          transactionId || zapTransactionData?.txn_id || orderIdFinal, 
          utrFinal || zapTransactionData?.utr || '',
          environment
        );
        
        if (result.success) console.log(`[ZapUPI Webhook] Wallet updated for ${orderIdFinal}`);
      }

      res.status(200).send("OK");
    } catch (error: any) {
      console.error("[ZapUPI Webhook] CRITICAL ERROR:", error.message);
      res.status(500).send("Internal Server Error");
    }
  });

  // Cashfree Webhook
  serverApp.post("/api/cashfree/webhook", async (req, res) => {
    try {
      const signature = req.headers["x-webhook-signature"] as string;
      const timestamp = req.headers["x-webhook-timestamp"] as string;
      const rawBody = (req as any).rawBody;

      if (!signature || !timestamp || !rawBody) {
        return res.status(400).json({ success: false, error: "Missing webhook headers" });
      }

      const config: any = await getActiveGateway();
      
      // Use env variables as fallback if Firestore is not yet configured
      const clientId = config?.apiKey || process.env.CASHFREE_CLIENT_ID;
      const clientSecret = config?.secretKey || process.env.CASHFREE_CLIENT_SECRET;
      const webhookSecret = config?.webhookSecret || process.env.CASHFREE_WEBHOOK_SECRET || clientSecret;
      
      if (!clientId || !clientSecret) {
         console.error("[Cashfree Webhook] No credentials found to verify signature!");
         return res.status(400).json({ success: false, error: "Gateway unconfigured" });
      }

      const isProd = (config?.isProduction) || (clientId && !clientId.includes('TEST'));
      const environment = isProd ? "PRODUCTION" : "SANDBOX";
      
      const { data: eventData, type } = req.body;
      const orderId = eventData?.order?.order_id;
      
      (Cashfree as any).XClientId = clientId;
      (Cashfree as any).XClientSecret = clientSecret;
      (Cashfree as any).XEnvironment = isProd ? (Cashfree as any).Environment.PRODUCTION : (Cashfree as any).Environment.SANDBOX;

      try {
        console.log(`[Cashfree Webhook] Verifying signature for Order: ${orderId || 'Unknown'}...`);
        // V5 webhook verification is often static
        (Cashfree as any).PGVerifyWebhookSignature(signature, rawBody, timestamp);
        console.log(`[Cashfree Webhook] Signature verified.`);
      } catch (err) {
        console.warn("[Cashfree Webhook] Signature verification failed");
        return res.status(401).json({ success: false, error: "Invalid signature" });
      }
      
      if (!orderId) {
        return res.status(200).json({ success: true, message: "OK - No Order ID" });
      }

      console.log(`[Cashfree Webhook] Event: ${type} | Order: ${orderId}`);
      
      const userId = eventData.customer_details.customer_id;
      const amount = Number(eventData.payment.payment_amount);
      const paymentId = eventData.payment.cf_payment_id;

      const transRef = firestore.collection('transactions').doc(orderId);
      const userRef = firestore.collection('users').doc(userId);

      if (type === "PAYMENT_SUCCESS_WEBHOOK") {
        await firestore.runTransaction(async (t: any) => {
          const transDoc = await t.get(transRef);
          
          if (transDoc.exists && transDoc.data()?.status === 'completed') {
            console.log(`[Cashfree Webhook] Order ${orderId} already completed. skipping.`);
            return;
          }

          t.set(transRef, {
            userId: userId,
            type: 'deposit',
            amount: amount,
            status: 'completed',
            title: 'Deposit via Cashfree',
            paymentId: paymentId,
            gateway: 'cashfree',
            updatedAt: FieldValue.serverTimestamp(),
            createdAt: transDoc.exists ? transDoc.data()?.createdAt : FieldValue.serverTimestamp()
          }, { merge: true });

          t.update(userRef, {
            'wallet.deposit': FieldValue.increment(amount),
            'stats.totalDeposited': FieldValue.increment(amount)
          });
        });
        console.log(`[Cashfree Webhook] Wallet updated for user ${userId} | Amount: ${amount}`);
      } else {
        // Record non-success events too
        const status = type === "PAYMENT_FAILED_WEBHOOK" ? 'failed' : 
                       (type === "PAYMENT_USER_DROPPED_WEBHOOK" ? 'abandoned' : 'pending');
        
        await transRef.set({
          userId: userId,
          type: 'deposit',
          amount: amount,
          status: status,
          title: `Deposit ${status} via Cashfree`,
          paymentId: paymentId,
          gateway: 'cashfree',
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        console.log(`[Cashfree Webhook] Order ${orderId} status set to ${status}`);
      }

      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error("[Cashfree Webhook] Internal Error:", error);
      res.status(500).json({ success: false, error: "Internal Server Error", detail: error.message });
    }
  });

  // API Catch-all for undefined routes
  serverApp.all("/api/*", (req, res) => {
    res.status(404).json({ success: false, error: `API route ${req.method} ${req.originalUrl} not found` });
  });

  // Global error handler for API routes
  serverApp.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.path.startsWith("/api/")) {
      console.error(`[API Error] ${req.method} ${req.path}:`, err);
      return res.status(500).json({ 
        success: false, 
        error: "Internal Server Error", 
        message: err.message 
      });
    }
    next(err);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    serverApp.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    serverApp.use(express.static(distPath));
    serverApp.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  serverApp.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
