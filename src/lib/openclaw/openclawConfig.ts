import fs from "node:fs/promises";
import path from "node:path";
import { getOpenClawHomeDir } from "./paths";

export type OpenClawConfig = {
  gateway?: {
    port?: number;
    auth?: {
      token?: string;
    };
  };
};

export async function readOpenClawConfigFromHome(): Promise<OpenClawConfig | null> {
  const configPath = path.join(getOpenClawHomeDir(), "openclaw.json");
  try {
    const text = await fs.readFile(configPath, "utf-8");
    return JSON.parse(text) as OpenClawConfig;
  } catch {
    return null;
  }
}

export async function getOpenClawGatewayConnectionFromHome(): Promise<{
  url: string;
  token?: string;
}> {
  const cfg = await readOpenClawConfigFromHome();
  const port = cfg?.gateway?.port ?? 18789;
  const token = cfg?.gateway?.auth?.token;
  return {
    url: `http://127.0.0.1:${port}`,
    token: token && token.trim() ? token.trim() : undefined,
  };
}

