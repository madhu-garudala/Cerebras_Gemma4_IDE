export interface FileNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: FileNode[];
}

async function apiFetch(input: RequestInfo, init?: RequestInit) {
  const res = await fetch(input, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export const fsProvider = {
  async listTree(): Promise<FileNode[]> {
    return apiFetch("/api/fs/tree");
  },

  async listDir(relPath: string): Promise<FileNode[]> {
    return apiFetch(`/api/fs/tree?path=${encodeURIComponent(relPath)}`);
  },

  async readFile(path: string): Promise<string> {
    const data = await apiFetch(`/api/fs/file?path=${encodeURIComponent(path)}`);
    return data.content as string;
  },

  async writeFile(path: string, content: string): Promise<void> {
    await apiFetch("/api/fs/file", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, content }),
    });
  },

  async getRoot(): Promise<string | null> {
    const data = await apiFetch("/api/fs/setroot");
    return data.root as string | null;
  },

  async setRoot(path: string): Promise<string> {
    const data = await apiFetch("/api/fs/setroot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    return data.root as string;
  },
};
