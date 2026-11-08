import { initializeApp as initClientApp, getApps as getClientApps, getApp as getClientApp } from "firebase/app";
import {
  getFirestore as getClientFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction as runClientTransaction,
  serverTimestamp as clientServerTimestamp,
  increment as clientIncrement
} from "firebase/firestore";
import fs from "fs";
import path from "path";

// Embedded default fallback config for serverless environments (Vercel, etc.)
const DEFAULT_FIREBASE_CONFIG = {
  projectId: "autonomous-receiver-93rp2",
  appId: "1:110861457475:web:d7087365f9fb77b8b41cf6",
  apiKey: "AIzaSyCxMg8vqocWSlHLIJlc3d17vYkJX2OBE7g",
  authDomain: "autonomous-receiver-93rp2.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-kidsaddafreefire-7974c2ef-2888-4e20-9391-61b09a11835c",
  storageBucket: "autonomous-receiver-93rp2.firebasestorage.app",
  messagingSenderId: "110861457475"
};

export class DocRefWrapper {
  constructor(public firestoreInstance: any, public colPath: string, public docId: string) {}

  get docRef() {
    return doc(this.firestoreInstance, this.colPath, this.docId);
  }

  async get() {
    try {
      const snap = await getDoc(this.docRef);
      return {
        exists: snap.exists(),
        data: () => snap.data(),
        id: snap.id
      };
    } catch (err: any) {
      console.warn(`[Firestore Client Adapter] get notice on ${this.colPath}/${this.docId}:`, err.message);
      return {
        exists: false,
        data: () => undefined,
        id: this.docId
      };
    }
  }

  async set(data: any, options?: { merge?: boolean }) {
    if (options?.merge) {
      return setDoc(this.docRef, data, { merge: true });
    }
    return setDoc(this.docRef, data);
  }

  async update(data: any) {
    return updateDoc(this.docRef, data);
  }
}

export class CollectionRefWrapper {
  constructor(public firestoreInstance: any, public colPath: string) {}

  doc(id?: string) {
    const docId = id || Math.random().toString(36).substring(2, 15);
    return new DocRefWrapper(this.firestoreInstance, this.colPath, docId);
  }
}

export const FieldValue = {
  serverTimestamp: () => clientServerTimestamp(),
  increment: (n: number) => clientIncrement(n)
};

export function getFirebaseAdmin() {
  let firebaseConfig: any = { ...DEFAULT_FIREBASE_CONFIG };

  try {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      const fileData = JSON.parse(fs.readFileSync(configPath, "utf8"));
      firebaseConfig = { ...firebaseConfig, ...fileData };
    }
  } catch (e) {
    // Ignore file read error in serverless environments
  }

  const databaseId =
    process.env.FIRESTORE_DATABASE_ID ||
    firebaseConfig.firestoreDatabaseId ||
    "(default)";

  // Initialize Client SDK (Pure web client SDK - ZERO service account key needed)
  let clientApp: any;
  if (getClientApps().length === 0) {
    clientApp = initClientApp(firebaseConfig);
  } else {
    clientApp = getClientApp();
  }

  const clientDb = getClientFirestore(clientApp, databaseId);

  const wrappedDb = {
    collection: (colPath: string) => new CollectionRefWrapper(clientDb, colPath),
    runTransaction: async (updateFn: (t: any) => Promise<any>) => {
      return runClientTransaction(clientDb, async (clientT: any) => {
        const transactionWrapper = {
          async get(docRefOrWrapper: any) {
            const ref = docRefOrWrapper.docRef || docRefOrWrapper;
            const snap = await clientT.get(ref);
            return {
              exists: snap.exists(),
              data: () => snap.data(),
              id: snap.id
            };
          },
          set(docRefOrWrapper: any, data: any, options?: any) {
            const ref = docRefOrWrapper.docRef || docRefOrWrapper;
            return clientT.set(ref, data, options);
          },
          update(docRefOrWrapper: any, data: any) {
            const ref = docRefOrWrapper.docRef || docRefOrWrapper;
            return clientT.update(ref, data);
          }
        };
        return updateFn(transactionWrapper);
      });
    }
  };

  return { app: clientApp, db: wrappedDb, databaseId, FieldValue };
}

export default getFirebaseAdmin;
