import { getApps, initializeApp, getApp, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import fs from "fs";
import path from "path";

const DEFAULT_FIREBASE_CONFIG = {
  projectId: "autonomous-receiver-93rp2",
  firestoreDatabaseId: "ai-studio-kidsaddafreefire-7974c2ef-2888-4e20-9391-61b09a11835c"
};

const ADMIN_UIDS = ["XoXyXcnrlzOaMIKKolXnU3mT9xn1"];
const ADMIN_EMAILS = [
  "playersarena.site@gmail.com",
  "tournament909@gmail.com",
  "harsha.cpr001@gmail.com",
  "admin@khelgalli.com",
  "qupagaming@gmail.com",
  "mahendrathakur9009@gmail.com",
  "mahendrar9009@gmail.com",
  "chouhanadarsh99@gmail.com"
];

function getFirebaseAdmin() {
  let cfg: any = { ...DEFAULT_FIREBASE_CONFIG };
  try {
    const p = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(p)) cfg = { ...cfg, ...JSON.parse(fs.readFileSync(p, "utf8")) };
  } catch (e) {}

  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || cfg.projectId;
  const databaseId = process.env.FIRESTORE_DATABASE_ID || cfg.firestoreDatabaseId || "(default)";
  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  let app: any;
  if (getApps().length === 0) {
    try {
      if (key) {
        const parsed = typeof key === "string" && key.trim().startsWith("{") ? JSON.parse(key) : key;
        app = initializeApp({ credential: cert(parsed as any), projectId });
      } else {
        app = initializeApp({ projectId });
      }
    } catch (e) {
      app = getApps()[0] || initializeApp({ projectId });
    }
  } else {
    app = getApp();
  }

  let db: any;
  try {
    db = getFirestore(app, databaseId);
  } catch (e) {
    db = getFirestore(app);
  }
  return { app, db };
}

// Mirrors the isAdmin() rule in firestore.rules
async function isAdminUser(app: any, db: any, req: any): Promise<boolean> {
  const header = String(req.headers?.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return false;

  let decoded: any;
  try {
    decoded = await getAuth(app).verifyIdToken(token);
  } catch (e) {
    return false;
  }

  const uid: string = decoded.uid;
  const email: string = String(decoded.email || "").toLowerCase();
  if (ADMIN_UIDS.includes(uid)) return true;
  if (email && ADMIN_EMAILS.includes(email)) return true;

  try {
    if ((await db.collection("admins").doc(uid).get()).exists) return true;
    if (email && (await db.collection("admins").doc(email).get()).exists) return true;
    const userDoc = await db.collection("users").doc(uid).get();
    if (userDoc.exists && userDoc.data()?.isAdmin === true) return true;
  } catch (e) {}
  return false;
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });

  if (process.env.VERCEL && !process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    return res.status(500).json({
      success: false,
      error: "Firebase service account missing. Add FIREBASE_SERVICE_ACCOUNT_KEY in Vercel -> Settings -> Environment Variables, then redeploy."
    });
  }

  const { app, db } = getFirebaseAdmin();
  if (!db) return res.status(500).json({ error: "Firestore Admin not initialized" });

  if (!(await isAdminUser(app, db, req))) {
    return res.status(401).json({ success: false, error: "Admin authentication required" });
  }

  const action = String(req.query?.action || "");
  const body = req.body || {};

  try {
    if (action === "approve-deposit") {
      const { txId, userId, amount } = body;
      if (!txId || !userId || !amount || Number(amount) <= 0) {
        return res.status(400).json({ error: "Missing txId, userId, or valid amount" });
      }
      const depositAmount = Number(amount);
      const transRef = db.collection("transactions").doc(txId);
      const userRef = db.collection("users").doc(userId);
      await db.runTransaction(async (t: any) => {
        const transDoc = await t.get(transRef);
        if (transDoc.exists && transDoc.data()?.status === "completed") return;
        t.set(transRef, {
          status: "completed",
          approvedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        t.set(userRef, { wallet: { deposit: FieldValue.increment(depositAmount) } }, { merge: true });
      });
      return res.json({ success: true });
    }

    if (action === "reject-deposit") {
      const { txId } = body;
      if (!txId) return res.status(400).json({ error: "Missing txId" });
      await db.collection("transactions").doc(txId).set({
        status: "failed",
        rejectedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      return res.json({ success: true });
    }

    if (action === "approve-withdrawal") {
      const { txId } = body;
      if (!txId) return res.status(400).json({ error: "Missing txId" });
      await db.collection("transactions").doc(txId).set({
        status: "completed",
        approvedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });
      return res.json({ success: true });
    }

    if (action === "reject-withdrawal") {
      const { txId, userId, amount } = body;
      if (!txId) return res.status(400).json({ error: "Missing txId" });
      const refundAmount = Number(amount || 0);
      const transRef = db.collection("transactions").doc(txId);
      await db.runTransaction(async (t: any) => {
        const transDoc = await t.get(transRef);
        if (transDoc.exists && transDoc.data()?.status === "failed") return;
        t.set(transRef, {
          status: "failed",
          rejectedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        if (userId && refundAmount > 0) {
          t.set(db.collection("users").doc(userId), {
            wallet: { winnings: FieldValue.increment(refundAmount) }
          }, { merge: true });
        }
      });
      return res.json({ success: true });
    }

    return res.status(404).json({ success: false, error: `API route POST /api/admin/${action} not found` });
  } catch (err: any) {
    console.error(`[Admin API] ${action} error:`, err.message);
    return res.status(500).json({ error: err.message });
  }
}
