import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import type { User } from "firebase/auth";
import {
  auth,
  signInWithGoogle,
  signOutUser,
  saveTopologyToFirestore,
  loadTopologiesFromFirestore,
  deleteTopologyFromFirestore,
  type StoredTopology,
} from "./index";
import { onAuthStateChanged } from "firebase/auth";
import { useBay } from "../patchbay/model";

interface FirebaseContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  isSyncing: boolean;
  lastSyncedAt: Date | null;
  syncCurrentTopology: () => Promise<void>;
  savedTopologies: StoredTopology[];
  refreshSavedTopologies: () => Promise<void>;
  loadTopology: (item: StoredTopology) => void;
  deleteTopology: (id: string) => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextType | null>(null);

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [savedTopologies, setSavedTopologies] = useState<StoredTopology[]>([]);
  const hasLoadedInitialUserDiagram = useRef(false);

  // Listen to Auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (currentUser) => {
        setUser(currentUser);
        setLoading(false);
        if (currentUser) {
          try {
            const list = await loadTopologiesFromFirestore(currentUser.uid);
            setSavedTopologies(list);
            // If user has saved topologies and we haven't loaded one yet, optionally offer or load default
            if (list.length > 0 && !hasLoadedInitialUserDiagram.current) {
              const defaultItem = list.find((t) => t.isDefault) || list[0];
              if (defaultItem && defaultItem.nodes?.length > 0) {
                // Keep local state or load remote
              }
              hasLoadedInitialUserDiagram.current = true;
            }
          } catch (err) {
            console.warn("[Firebase] Could not load topologies:", err);
          }
        } else {
          setSavedTopologies([]);
          hasLoadedInitialUserDiagram.current = false;
        }
      },
      (err) => {
        console.error("[Firebase] Auth state error:", err);
        setError(err.message);
        setLoading(false);
      },
    );

    return () => unsubscribe();
  }, []);

  const refreshSavedTopologies = useCallback(async () => {
    if (!user) return;
    try {
      const list = await loadTopologiesFromFirestore(user.uid);
      setSavedTopologies(list);
    } catch (err) {
      console.error("[Firebase] Refresh topologies error:", err);
    }
  }, [user]);

  const syncCurrentTopology = useCallback(async () => {
    if (!user) {
      setError("Please sign in with Google to save to cloud database");
      return;
    }
    setIsSyncing(true);
    setError(null);
    try {
      const { name, nodes, edges } = useBay.getState();
      const currentId = name.toLowerCase().replace(/[^a-z0-9_-]/g, "-") || "default-homelab";
      await saveTopologyToFirestore(user.uid, {
        id: currentId,
        name: name || "Homelab Network",
        nodes,
        edges,
      });
      setLastSyncedAt(new Date());
      await refreshSavedTopologies();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error("[Firebase] Sync error:", err);
    } finally {
      setIsSyncing(false);
    }
  }, [user, refreshSavedTopologies]);

  const loadTopology = useCallback((item: StoredTopology) => {
    if (!item.nodes) return;
    useBay.setState({
      name: item.name,
      nodes: item.nodes,
      edges: item.edges || [],
      selection: null,
      focusId: null,
      fitToken: useBay.getState().fitToken + 1,
    });
  }, []);

  const deleteTopology = useCallback(
    async (id: string) => {
      if (!user) return;
      try {
        await deleteTopologyFromFirestore(user.uid, id);
        await refreshSavedTopologies();
      } catch (err) {
        console.error("[Firebase] Delete error:", err);
      }
    },
    [user, refreshSavedTopologies],
  );

  const handleSignIn = async () => {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  };

  const handleSignOut = async () => {
    setError(null);
    try {
      await signOutUser();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    }
  };

  return (
    <FirebaseContext.Provider
      value={{
        user,
        loading,
        error,
        signIn: handleSignIn,
        signOut: handleSignOut,
        isSyncing,
        lastSyncedAt,
        syncCurrentTopology,
        savedTopologies,
        refreshSavedTopologies,
        loadTopology,
        deleteTopology,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export function useFirebase() {
  const ctx = useContext(FirebaseContext);
  if (!ctx) {
    throw new Error("useFirebase must be used within a FirebaseProvider");
  }
  return ctx;
}
