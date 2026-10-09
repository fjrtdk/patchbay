import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  collection,
  query,
  orderBy,
  serverTimestamp,
  getDocFromServer,
  Timestamp,
} from "firebase/firestore";
import firebaseConfig from "../../../firebase-applet-config.json";
import type { GraphEdge, GraphNode } from "../patchbay/types";

// Initialize Firebase App
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// Initialize Firestore with specific database ID if configured
export const db = firebaseConfig.firestoreDatabaseId
  ? getFirestore(app, firebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

// Initialize Firebase Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const currentUser = auth.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo:
        currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error("Firestore Error:", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Validate connection to Firestore on boot as required by AI Studio guidelines.
 */
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.warn("[Firebase] Client is offline or database not yet reachable:", error.message);
      return false;
    }
    // Permission denied on test/connection is expected since default deny catches it
    return true;
  }
}

// Ensure test connection runs on boot
if (typeof window !== "undefined") {
  testConnection().catch(() => {});
}

// Auth operations
export async function signInWithGoogle(): Promise<User> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    if (result.user) {
      await syncUserProfile(result.user);
    }
    return result.user;
  } catch (error) {
    console.error("[Auth] Google Sign-in error:", error);
    throw error;
  }
}

export async function signOutUser(): Promise<void> {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("[Auth] Sign-out error:", error);
    throw error;
  }
}

// User Profile sync
export async function syncUserProfile(user: User): Promise<void> {
  const userRef = doc(db, "users", user.uid);
  try {
    const existing = await getDoc(userRef);
    if (!existing.exists()) {
      await setDoc(userRef, {
        id: user.uid,
        email: user.email || "",
        displayName: user.displayName || "Homelab Admin",
        photoURL: user.photoURL || "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(
        userRef,
        {
          email: user.email || "",
          displayName: user.displayName || "Homelab Admin",
          photoURL: user.photoURL || "",
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
  }
}

export interface StoredTopology {
  id: string;
  userId: string;
  name: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  isDefault?: boolean;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

// Save Topology to Firestore
export async function saveTopologyToFirestore(
  userId: string,
  topology: { id?: string; name: string; nodes: GraphNode[]; edges: GraphEdge[] },
): Promise<string> {
  const id = topology.id && topology.id.trim() ? topology.id : "default-homelab";
  const path = `users/${userId}/topologies/${id}`;
  const docRef = doc(db, "users", userId, "topologies", id);

  try {
    const existing = await getDoc(docRef);
    if (!existing.exists()) {
      await setDoc(docRef, {
        id,
        userId,
        name: topology.name || "My Homelab",
        nodes: topology.nodes || [],
        edges: topology.edges || [],
        isDefault: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(
        docRef,
        {
          name: topology.name || "My Homelab",
          nodes: topology.nodes || [],
          edges: topology.edges || [],
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Load user topologies from Firestore
export async function loadTopologiesFromFirestore(userId: string): Promise<StoredTopology[]> {
  const path = `users/${userId}/topologies`;
  try {
    const colRef = collection(db, "users", userId, "topologies");
    const q = query(colRef, orderBy("updatedAt", "desc"));
    const snap = await getDocs(q);
    const list: StoredTopology[] = [];
    snap.forEach((docSnap) => {
      list.push(docSnap.data() as StoredTopology);
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

// Delete user topology
export async function deleteTopologyFromFirestore(userId: string, topologyId: string): Promise<void> {
  const path = `users/${userId}/topologies/${topologyId}`;
  try {
    await deleteDoc(doc(db, "users", userId, "topologies", topologyId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export interface StoredScan {
  id: string;
  userId: string;
  title: string;
  rawText: string;
  nodeCount: number;
  createdAt: Timestamp | Date;
}

// Save discovery scan log to Firestore
export async function saveScanToFirestore(
  userId: string,
  scan: { id: string; title: string; rawText: string; nodeCount: number },
): Promise<void> {
  const path = `users/${userId}/scans/${scan.id}`;
  try {
    await setDoc(doc(db, "users", userId, "scans", scan.id), {
      id: scan.id,
      userId,
      title: scan.title,
      rawText: scan.rawText,
      nodeCount: scan.nodeCount,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

// Load discovery scans from Firestore
export async function loadScansFromFirestore(userId: string): Promise<StoredScan[]> {
  const path = `users/${userId}/scans`;
  try {
    const colRef = collection(db, "users", userId, "scans");
    const q = query(colRef, orderBy("createdAt", "desc"));
    const snap = await getDocs(q);
    const list: StoredScan[] = [];
    snap.forEach((d) => {
      list.push(d.data() as StoredScan);
    });
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}
