import { placeBody } from "../types/body";
import type { ResearchNote } from "../types/research-note";

/** PBKDF2-SHA256 iterations. OWASP 2023 lower bound for SHA-256 is 600k; we stay at the requested floor. */
export const PBKDF2_ITERATIONS = 310_000;
export const MAX_PBKDF2_ITERATIONS = PBKDF2_ITERATIONS * 2;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;
export const HIDDEN_TITLE = "잠긴 자료";

export class LockError extends Error {
  constructor(message = "비밀번호가 맞지 않아요") {
    super(message);
    this.name = "LockError";
  }
}

export interface SealedChunk {
  index: number;
  iv: string;
  ciphertext: string;
}

export interface SealedNote {
  publicTitle: string;
  titleHidden: boolean;
  salt: string;
  iterations: number;
  iv: string;
  ciphertext: string;
  chunks: SealedChunk[];
}

export interface OpenSecrets {
  title: string;
  summary: string;
  keywords: string[];
  body: string;
}

interface SecretBlob {
  summary: string;
  keywords: string[];
  title?: string;
  body?: string;
}

export async function sealNote(input: {
  title: string;
  summary: string;
  keywords: string[];
  body: string;
  password: string;
  hideTitle: boolean;
}): Promise<SealedNote> {
  if (!input.password) throw new LockError("비밀번호를 입력해 주세요.");
  const placed = placeBody(input.body);
  const blob: SecretBlob = {
    summary: input.summary,
    keywords: input.keywords,
    ...(input.hideTitle ? { title: input.title } : {}),
    ...(placed.chunks.length ? {} : { body: placed.inline }),
  };
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const key = await deriveKey(input.password, salt, PBKDF2_ITERATIONS);
  const packed = await encryptText(key, JSON.stringify(blob));
  const chunks: SealedChunk[] = [];
  for (let index = 0; index < placed.chunks.length; index += 1) {
    const piece = await encryptText(key, placed.chunks[index] ?? "");
    chunks.push({ index, iv: toBase64(piece.iv), ciphertext: toBase64(piece.ciphertext) });
  }
  return {
    publicTitle: input.hideTitle ? HIDDEN_TITLE : input.title,
    titleHidden: input.hideTitle,
    salt: toBase64(salt),
    iterations: PBKDF2_ITERATIONS,
    iv: toBase64(packed.iv),
    ciphertext: toBase64(packed.ciphertext),
    chunks,
  };
}

export async function openSealed(sealed: SealedNote, password: string): Promise<OpenSecrets> {
  if (!Number.isInteger(sealed.iterations) || sealed.iterations < PBKDF2_ITERATIONS || sealed.iterations > MAX_PBKDF2_ITERATIONS) {
    throw new LockError("잠금 설정을 열 수 없어요.");
  }
  const key = await deriveKey(password, fromBase64(sealed.salt), sealed.iterations);
  const blob = JSON.parse(await decryptText(key, sealed.iv, sealed.ciphertext)) as SecretBlob;
  let body = blob.body ?? "";
  if (sealed.chunks.length) {
    const parts: string[] = [];
    for (const chunk of [...sealed.chunks].sort((a, b) => a.index - b.index)) {
      parts.push(await decryptText(key, chunk.iv, chunk.ciphertext));
    }
    body = parts.join("");
  }
  return {
    title: blob.title ?? sealed.publicTitle,
    summary: blob.summary,
    keywords: blob.keywords,
    body,
  };
}

export async function lockResearchNote(note: ResearchNote, password: string, hideTitle: boolean): Promise<ResearchNote> {
  const sealed = await sealNote({
    title: note.title,
    summary: note.summary,
    keywords: note.keywords,
    body: note.body,
    password,
    hideTitle,
  });
  return {
    ...note,
    title: sealed.publicTitle,
    summary: "",
    keywords: [],
    body: "",
    excerpt: "",
    locked: true,
    title_hidden: sealed.titleHidden,
    lock_salt: sealed.salt,
    lock_iterations: sealed.iterations,
    lock_iv: sealed.iv,
    lock_ciphertext: sealed.ciphertext,
    locked_chunks: sealed.chunks,
  };
}

export async function unlockResearchNote(note: ResearchNote, password: string): Promise<ResearchNote> {
  const opened = await openSealed(
    {
      publicTitle: note.title,
      titleHidden: note.title_hidden,
      salt: note.lock_salt,
      iterations: note.lock_iterations,
      iv: note.lock_iv,
      ciphertext: note.lock_ciphertext,
      chunks: note.locked_chunks,
    },
    password,
  );
  return {
    ...note,
    title: opened.title,
    summary: opened.summary,
    keywords: opened.keywords,
    body: opened.body,
    locked: false,
    title_hidden: false,
    lock_salt: "",
    lock_iterations: 0,
    lock_iv: "",
    lock_ciphertext: "",
    locked_chunks: [],
  };
}

export async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", asBuffer(new TextEncoder().encode(password)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: asBuffer(salt), iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptText(key: CryptoKey, text: string): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: asBuffer(iv) }, key, asBuffer(new TextEncoder().encode(text)));
  return { iv, ciphertext: new Uint8Array(cipher) };
}

async function decryptText(key: CryptoKey, iv: string, ciphertext: string): Promise<string> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: asBuffer(fromBase64(iv)) },
      key,
      asBuffer(fromBase64(ciphertext)),
    );
    return new TextDecoder().decode(plain);
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    const message = error instanceof Error ? error.message : "";
    if (name === "OperationError" || /GCM|authentication|decrypt/i.test(`${name} ${message}`)) {
      throw new LockError("비밀번호가 맞지 않아요");
    }
    throw new LockError("비밀번호가 맞지 않아요");
  }
}

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
  return out;
}
