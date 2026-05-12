import { create } from "zustand";
import { shareApi, fileApi, settingsApi, systemApi } from "@/lib/tauri-api";
import type { SavedConnection, Peer, ClientInfo, RemoteDirEntry } from "@/types";

interface ShareState {
  shareStatus: { port: number; path: string } | null;
  localIp: string;
  savedConnections: SavedConnection[];
  peers: Peer[];
  connectedClients: ClientInfo[];

  fetchShareStatus: () => Promise<void>;
  startShare: (path: string, password: string) => Promise<number>;
  stopShare: () => Promise<void>;

  fetchConnections: () => Promise<void>;
  addConnection: (addr: string, password: string, label?: string) => Promise<void>;
  removeConnection: (addr: string) => Promise<void>;
  reconnect: (addr: string, password: string) => Promise<void>;
  updateLastPath: (addr: string, path: string) => Promise<void>;

  fetchPeers: () => Promise<void>;
  fetchLocalIp: () => Promise<void>;
  fetchConnectedClients: () => Promise<void>;
}

const saveConnectionsToSettings = async (connections: SavedConnection[]) => {
  const settings = await settingsApi.get();
  await settingsApi.update({ ...settings, share_connections: JSON.stringify(connections) });
};

export const useShareStore = create<ShareState>((set, get) => ({
  shareStatus: null,
  localIp: "",
  savedConnections: [],
  peers: [],
  connectedClients: [],

  fetchShareStatus: async () => {
    const status = await shareApi.getStatus();
    set({ shareStatus: status });
  },

  startShare: async (path: string, password: string) => {
    const port = await shareApi.start(path, password);
    await get().fetchShareStatus();
    return port;
  },

  stopShare: async () => {
    await shareApi.stop();
    set({ shareStatus: null, connectedClients: [] });
  },

  fetchConnections: async () => {
    const settings = await settingsApi.get();
    const raw = settings["share_connections"];
    if (raw) {
      try {
        set({ savedConnections: JSON.parse(raw) });
      } catch {
        set({ savedConnections: [] });
      }
    } else {
      set({ savedConnections: [] });
    }
  },

  addConnection: async (addr: string, password: string, label?: string) => {
    await shareApi.join(addr, password);

    // 尝试获取根目录名优化 label
    let finalLabel = label || addr;
    try {
      const entries = await shareApi.listRemote(addr, password, "");
      const firstDir = entries.find((e: RemoteDirEntry) => e.is_dir);
      if (firstDir && !label) {
        finalLabel = firstDir.name;
      }
    } catch {
      // 获取失败不影响连接流程
    }

    const conn: SavedConnection = {
      addr,
      password,
      label: finalLabel,
      last_connected: new Date().toISOString(),
      last_path: "",
    };
    const connections = [...get().savedConnections, conn];
    set({ savedConnections: connections });
    await saveConnectionsToSettings(connections);
  },

  removeConnection: async (addr: string) => {
    const connections = get().savedConnections.filter((c) => c.addr !== addr);
    set({ savedConnections: connections });
    await saveConnectionsToSettings(connections);
  },

  reconnect: async (addr: string, password: string) => {
    await shareApi.join(addr, password);
    const connections = get().savedConnections.map((c) =>
      c.addr === addr ? { ...c, last_connected: new Date().toISOString() } : c
    );
    set({ savedConnections: connections });
    await saveConnectionsToSettings(connections);
  },

  updateLastPath: async (addr: string, path: string) => {
    const connections = get().savedConnections.map((c) =>
      c.addr === addr ? { ...c, last_path: path } : c
    );
    set({ savedConnections: connections });
    await saveConnectionsToSettings(connections);
  },

  fetchPeers: async () => {
    const peers = await fileApi.discoverPeers();
    set({ peers });
  },

  fetchLocalIp: async () => {
    const ip = await systemApi.localIp();
    set({ localIp: ip });
  },

  fetchConnectedClients: async () => {
    const clients = await shareApi.getConnectedClients();
    set({ connectedClients: clients });
  },
}));