import { LabsidianError } from "../errors";
import type { HttpClient } from "../http/types";
import type { AiProvider } from "../settings";

export function summaryPrompt(input: { title: string; source: string; abstract: string; toc: string; body: string }): string {
  return [
    "연구 자료를 한국어 해요체로 요약해요. 없는 숫자는 만들지 말아요.",
    "글머리표만 써요.",
    "- 세 줄 요약 3개",
    "- 핵심 수치: 자료에 있는 숫자만. 없으면 '본문에서 확인된 수치가 없어요.'",
    "- 정책 시사점 2개",
    "",
    `제목: ${input.title}`,
    `출처: ${input.source}`,
    `초록:\n${input.abstract || "없음"}`,
    `목차:\n${input.toc || "없음"}`,
    `본문:\n${input.body}`,
  ].join("\n");
}

export async function summarize(http: HttpClient, provider: AiProvider, model: string, key: string, prompt: string): Promise<string> {
  switch (provider) {
    case "gemini":
      return gemini(http, model, key, prompt);
    case "openai":
      return openai(http, model, key, prompt);
    case "anthropic":
      return anthropic(http, model, key, prompt);
    default: {
      const exhaustive: never = provider;
      return exhaustive;
    }
  }
}

async function gemini(http: HttpClient, model: string, key: string, prompt: string): Promise<string> {
  const response = await http.request({
    url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  const payload = readJson(response.text, response.status, "Gemini");
  const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n") ?? "";
  if (!text.trim()) throw new LabsidianError("Gemini가 빈 요약을 돌려줬어요. 모델 이름을 확인해 보세요.");
  return text.trim();
}

async function openai(http: HttpClient, model: string, key: string, prompt: string): Promise<string> {
  const response = await http.request({
    url: "https://api.openai.com/v1/chat/completions",
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.2 }),
  });
  const payload = readJson(response.text, response.status, "OpenAI");
  const text = payload.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new LabsidianError("OpenAI가 빈 요약을 돌려줬어요. 모델 이름을 확인해 보세요.");
  return text.trim();
}

async function anthropic(http: HttpClient, model: string, key: string, prompt: string): Promise<string> {
  const response = await http.request({
    url: "https://api.anthropic.com/v1/messages",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens: 900, messages: [{ role: "user", content: prompt }] }),
  });
  const payload = readJson(response.text, response.status, "Anthropic");
  const text = payload.content?.map((part) => part.text ?? "").join("\n") ?? "";
  if (!text.trim()) throw new LabsidianError("Anthropic이 빈 요약을 돌려줬어요. 모델 이름을 확인해 보세요.");
  return text.trim();
}

interface GeminiBody {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}
interface OpenAIBody {
  choices?: { message?: { content?: string } }[];
}
interface AnthropicBody {
  content?: { text?: string }[];
}

function readJson(text: string, status: number, name: string): GeminiBody & OpenAIBody & AnthropicBody {
  let payload: (GeminiBody & OpenAIBody & AnthropicBody) | null = null;
  try {
    payload = JSON.parse(text) as GeminiBody & OpenAIBody & AnthropicBody;
  } catch {
    payload = null;
  }
  if (status >= 400 || !payload) {
    const snippet = text.replace(/\s+/g, " ").slice(0, 160);
    throw new LabsidianError(`${name} 요청이 실패했어요 (${status}). ${snippet}`);
  }
  return payload;
}
