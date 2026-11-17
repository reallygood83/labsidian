import { LabsidianError } from "../errors";
import type { HttpClient } from "../http/types";

export interface AuthSession {
  idToken: string;
  refreshToken: string;
  localId: string;
  email: string;
  expiresAt: number;
}

export async function signInWithPassword(http: HttpClient, apiKey: string, email: string, password: string): Promise<AuthSession> {
  return identity(http, apiKey, "accounts:signInWithPassword", { email, password, returnSecureToken: true });
}

export async function signUpWithPassword(http: HttpClient, apiKey: string, email: string, password: string): Promise<AuthSession> {
  return identity(http, apiKey, "accounts:signUp", { email, password, returnSecureToken: true });
}

export async function sendEmailVerification(http: HttpClient, apiKey: string, idToken: string): Promise<void> {
  const response = await http.request({
    url: `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(apiKey)}`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestType: "VERIFY_EMAIL", idToken }),
  });
  if (response.status >= 400) throw new LabsidianError("인증 메일을 보내지 못했어요. 잠시 뒤 다시 보내기를 눌러 주세요.");
}

export async function signInWithGoogleIdToken(http: HttpClient, apiKey: string, idToken: string): Promise<AuthSession> {
  return identity(http, apiKey, "accounts:signInWithIdp", {
    postBody: `id_token=${encodeURIComponent(idToken)}&providerId=google.com`,
    requestUri: "http://localhost",
    returnSecureToken: true,
  });
}

export async function refreshSession(http: HttpClient, apiKey: string, refreshToken: string): Promise<AuthSession> {
  const response = await http.request({
    url: `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }).toString(),
  });
  const payload = read(response.text, response.status);
  return {
    idToken: payload.id_token ?? payload.idToken ?? "",
    refreshToken: payload.refresh_token ?? payload.refreshToken ?? refreshToken,
    localId: payload.user_id ?? payload.localId ?? "",
    email: payload.email ?? "",
    expiresAt: Date.now() + Number(payload.expires_in ?? payload.expiresIn ?? 3600) * 1000,
  };
}

async function identity(http: HttpClient, apiKey: string, method: string, body: Record<string, unknown>): Promise<AuthSession> {
  const response = await http.request({
    url: `https://identitytoolkit.googleapis.com/v1/${method}?key=${encodeURIComponent(apiKey)}`,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = read(response.text, response.status);
  if (!payload.idToken) throw new LabsidianError("로그인에 실패했어요. 메일과 비밀번호를 확인해 보세요.");
  return {
    idToken: payload.idToken,
    refreshToken: payload.refreshToken ?? "",
    localId: payload.localId ?? "",
    email: payload.email ?? "",
    expiresAt: Date.now() + Number(payload.expiresIn ?? 3600) * 1000,
  };
}

function read(text: string, status: number): {
  idToken?: string;
  refreshToken?: string;
  localId?: string;
  email?: string;
  expiresIn?: string;
  id_token?: string;
  refresh_token?: string;
  user_id?: string;
  expires_in?: string;
} {
  let payload: { error?: { message?: string }; idToken?: string; refreshToken?: string; localId?: string; email?: string; expiresIn?: string; id_token?: string; refresh_token?: string; user_id?: string; expires_in?: string } = {};
  try {
    payload = JSON.parse(text) as typeof payload;
  } catch {
    throw new LabsidianError(`로그인 응답을 읽지 못했어요 (${status}). 내 볼트의 노트는 그대로예요.`);
  }
  if (status >= 400) {
    throw new LabsidianError(`로그인에 실패했어요 (${status}). ${payload.error?.message ?? ""} 내 볼트의 노트는 그대로예요.`);
  }
  return payload;
}

export const VERIFY_EMAIL_MESSAGE = "메일을 확인해 주세요. 받은 편지함의 링크를 누른 뒤 다시 로그인해 주세요.";

export function emailVerifiedFromToken(idToken: string): boolean {
  try {
    const part = idToken.split(".")[1] ?? "";
    const json = JSON.parse(decodeJwtPart(part)) as { email_verified?: boolean };
    return json.email_verified === true;
  } catch {
    return false;
  }
}

export async function refreshVerifiedSession(http: HttpClient, apiKey: string, session: AuthSession): Promise<AuthSession> {
  if (!session.refreshToken) return session;
  return refreshSession(http, apiKey, session.refreshToken);
}

export function userIdFromToken(idToken: string): string {
  try {
    const json = JSON.parse(decodeJwtPart(idToken.split(".")[1] ?? "")) as { user_id?: string; sub?: string };
    return json.user_id || json.sub || "";
  } catch {
    return "";
  }
}

function decodeJwtPart(part: string): string {
  const padded = part.replace(/-/g, "+").replace(/_/g, "/");
  return atob(padded);
}

export function parseFirebaseWebConfig(text: string): { projectId: string; apiKey: string } {
  let payload: unknown;
  const trimmed = text.trim().replace(/^\uFEFF/, "");
  try {
    payload = JSON.parse(trimmed);
  } catch {
    try {
      payload = JSON.parse(looseConfigObject(trimmed));
    } catch {
      throw new LabsidianError("웹 앱 설정을 읽지 못했어요. Firebase 콘솔의 firebaseConfig를 그대로 붙여 넣어 보세요.");
    }
  }
  if (!payload || typeof payload !== "object") throw new LabsidianError("설정 객체가 아니에요.");
  const record = payload as Record<string, unknown>;
  const projectId = typeof record.projectId === "string" ? record.projectId.trim() : "";
  const apiKey = typeof record.apiKey === "string" ? record.apiKey.trim() : "";
  if (!projectId || !apiKey) throw new LabsidianError("projectId와 apiKey가 없어요. 웹 앱 설정 JSON을 다시 복사해 보세요.");
  if (record.private_key || record.client_email) {
    throw new LabsidianError("서비스 계정 키는 붙이지 마세요. 웹 앱 설정만 사용해요.");
  }
  return { projectId, apiKey };
}

function looseConfigObject(text: string): string {
  const withoutLine = stripComments(text);
  const marker = withoutLine.search(/(?:const|let|var)\s+firebaseConfig\s*=/);
  const region = marker >= 0 ? withoutLine.slice(marker) : withoutLine;
  const brace = region.indexOf("{");
  let body = brace >= 0 ? balancedObject(region.slice(brace)) : region.trim();
  body = body.replace(/^(?:export\s+default\s+|const\s+\w+\s*=\s*|let\s+\w+\s*=\s*|var\s+\w+\s*=\s*)/, "");
  body = body.replace(/;?\s*$/, "");
  body = body.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');
  body = body.replace(/'([^'\\]*)'/g, (_match, value: string) => `"${value.replace(/"/g, '\\"')}"`);
  body = body.replace(/,(\s*[}\]])/g, "$1");
  return body;
}

function stripComments(text: string): string {
  let out = "";
  let quote: "\"" | "'" | null = null;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index] ?? "";
    const next = text[index + 1] ?? "";
    if (quote) {
      out += char;
      if (char === "\\" && next) {
        out += next;
        index += 1;
        continue;
      }
      if (char === quote) quote = null;
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      out += char;
      continue;
    }
    if (char === "/" && next === "/") {
      while (index < text.length && text[index] !== "\n") index += 1;
      if (text[index] === "\n") out += "\n";
      continue;
    }
    if (char === "/" && next === "*") {
      index += 2;
      while (index < text.length && !(text[index] === "*" && text[index + 1] === "/")) index += 1;
      index += 1;
      continue;
    }
    out += char;
  }
  return out;
}

function balancedObject(text: string): string {
  let depth = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(0, index + 1);
    }
  }
  return text;
}
