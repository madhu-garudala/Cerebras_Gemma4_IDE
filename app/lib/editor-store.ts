"use client";

import { create } from "zustand";

export interface TabEntry {
  path: string;   // relative path — used as unique key
  label: string;  // filename
  dirty: boolean;
}

interface EditorState {
  tabs: TabEntry[];
  activeTab: string | null; // path of active tab

  openTab: (path: string, label: string) => void;
  closeTab: (path: string) => void;
  setActive: (path: string) => void;
  markDirty: (path: string, dirty: boolean) => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [],
  activeTab: null,

  openTab(path, label) {
    const { tabs } = get();
    if (!tabs.find((t) => t.path === path)) {
      set({ tabs: [...tabs, { path, label, dirty: false }] });
    }
    set({ activeTab: path });
  },

  closeTab(path) {
    const { tabs, activeTab } = get();
    const idx = tabs.findIndex((t) => t.path === path);
    const remaining = tabs.filter((t) => t.path !== path);
    let next = activeTab;
    if (activeTab === path) {
      next = remaining[idx]?.path ?? remaining[idx - 1]?.path ?? null;
    }
    set({ tabs: remaining, activeTab: next });
  },

  setActive(path) {
    set({ activeTab: path });
  },

  markDirty(path, dirty) {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, dirty } : t)),
    }));
  },
}));
