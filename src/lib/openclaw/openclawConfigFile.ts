import fs from "node:fs/promises";
import path from "node:path";
import { getOpenClawHomeDir } from "./paths";

export function getOpenClawConfigPathInHome(): string {
  return path.join(getOpenClawHomeDir(), "openclaw.json");
}

export async function readOpenClawConfigJsonFromHome(): Promise<any> {
  const configPath = getOpenClawConfigPathInHome();
  const txt = await fs.readFile(configPath, "utf-8");
  return JSON.parse(txt);
}

export async function readOpenClawConfigJsonFromHomeOrEmpty(): Promise<any> {
  const configPath = getOpenClawConfigPathInHome();
  try {
    const txt = await fs.readFile(configPath, "utf-8");
    return JSON.parse(txt);
  } catch {
    return {};
  }
}

function backupSuffix(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return stamp;
}

export async function writeOpenClawConfigJsonToHome(config: any): Promise<{ ok: true; path: string; backupPath?: string }> {
  const homeDir = getOpenClawHomeDir();
  const configPath = getOpenClawConfigPathInHome();
  await fs.mkdir(homeDir, { recursive: true });

  let backupPath: string | undefined;
  try {
    const existing = await fs.readFile(configPath, "utf-8");
    backupPath = path.join(homeDir, `openclaw.json.backup.mc-${backupSuffix()}`);
    await fs.writeFile(backupPath, existing, "utf-8");
  } catch {
    // No existing config to backup (first-run).
  }

  const nextTxt = JSON.stringify(config, null, 2) + "\n";
  await fs.writeFile(configPath, nextTxt, "utf-8");
  return { ok: true, path: configPath, ...(backupPath ? { backupPath } : {}) };
}

export type OpenClawAgentEntry = Record<string, any> & { id: string };

export function getAgentListFromConfig(config: any): OpenClawAgentEntry[] {
  const list = config?.agents?.list;
  if (!Array.isArray(list)) return [];
  return list.filter((x: any) => x && typeof x === "object" && typeof x.id === "string");
}

export function findAgentInConfig(config: any, agentId: string): OpenClawAgentEntry | null {
  const list = getAgentListFromConfig(config);
  return list.find((a) => a.id === agentId) ?? null;
}
