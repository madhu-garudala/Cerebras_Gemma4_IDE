"use client";

import type { TabEntry } from "../lib/editor-store";

interface TabBarProps {
  tabs: TabEntry[];
  activeTab: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

export default function TabBar({ tabs, activeTab, onSelect, onClose }: TabBarProps) {
  return (
    <div className="flex items-end h-9 bg-[#252526] border-b border-[#3c3c3c] overflow-x-auto shrink-0">
      {tabs.map((tab) => {
        const isActive = tab.path === activeTab;
        return (
          <div
            key={tab.path}
            className={`flex items-center gap-1 px-3 h-full text-sm whitespace-nowrap cursor-pointer shrink-0 border-r border-[#3c3c3c] ${
              isActive
                ? "bg-[#1e1e1e] border-t-2 border-t-[#0078d4] text-white"
                : "bg-[#2d2d2d] text-[#8c8c8c] hover:text-[#cccccc]"
            }`}
            onClick={() => onSelect(tab.path)}
            title={tab.path}
          >
            <span>{tab.label}</span>
            {tab.dirty && (
              <span className="w-2 h-2 rounded-full bg-[#e7c547] inline-block" title="Unsaved" />
            )}
            <button
              className="ml-1 opacity-50 hover:opacity-100 text-xs leading-none"
              onClick={(e) => {
                e.stopPropagation();
                onClose(tab.path);
              }}
              title="Close tab"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
