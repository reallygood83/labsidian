export interface PublicFirebaseConfig {
  projectId: string;
  apiKey: string;
  teamId: string;
  briefingUrl: string;
}

export interface SetupStep {
  title: string;
  detail: string;
  href: string;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function setupSteps(projectId: string): SetupStep[] {
  const base = projectId ? `https://console.firebase.google.com/project/${projectId}` : "https://console.firebase.google.com/";
  return [
    {
      title: "프로젝트 만들기",
      detail: "Firebase에서 프로젝트 추가를 눌러 빈 프로젝트를 만들어요.",
      href: "https://console.firebase.google.com/",
    },
    {
      title: "웹 앱 추가",
      detail: "프로젝트 설정에서 웹 앱을 추가하고 firebaseConfig JSON을 복사해요.",
      href: projectId ? `${base}/settings/general` : base,
    },
    {
      title: "이메일 로그인 켜기",
      detail: "Authentication에서 이메일/비밀번호 제공자를 사용으로 켜요.",
      href: projectId ? `${base}/authentication/providers` : base,
    },
    {
      title: "Firestore 만들기",
      detail: "Firestore Database를 만들어요. 위치는 가까운 리전을 고르면 돼요.",
      href: projectId ? `${base}/firestore` : base,
    },
    {
      title: "규칙 붙여넣기",
      detail: "아래 규칙을 복사해 규칙 편집기에 붙여 넣고 게시해요.",
      href: projectId ? `${base}/firestore/rules` : base,
    },
  ];
}

export function encodePublicConfig(config: PublicFirebaseConfig): string {
  return base64UrlEncode(JSON.stringify({
    projectId: config.projectId,
    apiKey: config.apiKey,
    teamId: config.teamId,
    briefingUrl: config.briefingUrl,
  }));
}

export function decodePublicConfig(value: string): PublicFirebaseConfig {
  let parsed: Partial<PublicFirebaseConfig>;
  try {
    parsed = JSON.parse(base64UrlDecode(value)) as Partial<PublicFirebaseConfig>;
  } catch {
    throw new Error("초대 설정을 읽지 못했어요. 링크를 다시 받아 주세요.");
  }
  if (!parsed.projectId || !parsed.apiKey || !parsed.teamId) {
    throw new Error("초대 설정에 프로젝트 정보가 없어요. 관리자에게 새 링크를 요청해 주세요.");
  }
  return {
    projectId: parsed.projectId,
    apiKey: parsed.apiKey,
    teamId: parsed.teamId,
    briefingUrl: parsed.briefingUrl ?? "",
  };
}

export function buildInviteLinks(config: PublicFirebaseConfig, code: string): { obsidian: string; web: string } {
  const c = encodePublicConfig(config);
  const t = encodeURIComponent(code);
  const obsidian = `obsidian://labsidian-join?c=${c}&t=${t}`;
  const web = config.briefingUrl
    ? `${config.briefingUrl.replace(/\/$/, "")}/join?c=${c}&t=${t}`
    : "";
  return { obsidian, web };
}

export function parseInviteParams(c: string, t: string): { config: PublicFirebaseConfig; code: string } {
  if (!c || !t) throw new Error("초대 링크에 설정이나 팀코드가 없어요.");
  return { config: decodePublicConfig(c), code: decodeURIComponent(t) };
}

export function parseInviteUrl(url: string): { config: PublicFirebaseConfig; code: string } {
  const parsed = new URL(url);
  return parseInviteParams(parsed.searchParams.get("c") ?? "", parsed.searchParams.get("t") ?? "");
}

export async function hashTeamCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code.trim()));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function generateTeamCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length] ?? "A").join("");
}

export function generateTeamId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new TextDecoder().decode(bytes);
}
