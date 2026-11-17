export interface HttpRequest {
  url: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: string;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
  bytes: Uint8Array;
}

export interface HttpClient {
  request(input: HttpRequest): Promise<HttpResponse>;
}

export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export function browserHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "User-Agent": BROWSER_UA,
    Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    ...extra,
  };
}
