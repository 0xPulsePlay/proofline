/**
 * TxLINE free-tier auth — the two-token dance (verified live 2026-07-19).
 *
 * Every data request needs BOTH headers:
 *   Authorization: Bearer <guest JWT>   — from POST /auth/guest/start (no body)
 *   X-Api-Token: <apiToken>             — long-lived free-tier token
 *
 * The trap (observed, not documented): the apiToken is never a Bearer
 * (401 if you try) and the JWT alone is never enough (403 without
 * X-Api-Token). Odds snapshots additionally return 200-with-[] unless
 * ?asOf=<now-ms> is passed — a publication-window artifact that looks
 * exactly like an auth failure and isn't.
 *
 * The apiToken is a credential: env-only (TXLINE_API_TOKEN, or a file path
 * in TXLINE_API_TOKEN_FILE), never checked in, never logged.
 */
import { readFileSync } from "node:fs";

export const TXLINE_BASE_URL = "https://txline.txodds.com";

export interface TxLineAuth {
  jwt: string;
  apiToken: string;
}

export async function startGuestSession(baseUrl = TXLINE_BASE_URL): Promise<string> {
  const res = await fetch(`${baseUrl}/auth/guest/start`, { method: "POST" });
  if (!res.ok) throw new Error(`guest session start failed: HTTP ${res.status}`);
  const json = (await res.json()) as { token?: string };
  if (!json.token) throw new Error("guest session start returned no token");
  return json.token;
}

export function loadApiTokenFromEnv(): string {
  const direct = process.env.TXLINE_API_TOKEN;
  if (direct) return direct;
  const file = process.env.TXLINE_API_TOKEN_FILE;
  if (file) {
    const raw = readFileSync(file, "utf8").trim();
    // Accept either a bare token file or an access.json with { apiToken }.
    if (raw.startsWith("{")) {
      const parsed = JSON.parse(raw) as { apiToken?: string };
      if (parsed.apiToken) return parsed.apiToken;
      throw new Error(`no apiToken field in ${file}`);
    }
    return raw;
  }
  throw new Error("TXLINE_API_TOKEN or TXLINE_API_TOKEN_FILE must be set for live mode");
}

export async function authorize(baseUrl = TXLINE_BASE_URL): Promise<TxLineAuth> {
  return { jwt: await startGuestSession(baseUrl), apiToken: loadApiTokenFromEnv() };
}

export function dataHeaders(auth: TxLineAuth): Record<string, string> {
  return { Authorization: `Bearer ${auth.jwt}`, "X-Api-Token": auth.apiToken };
}
