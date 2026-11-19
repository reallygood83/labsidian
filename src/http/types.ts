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

/**
 * Research Shelf says who it is instead of posing as a browser, so site operators can
 * tell these requests apart and reach the project if something goes wrong.
 */
export const USER_AGENT = "ResearchShelf/0.2 (Obsidian research plugin; +https://github.com/reallygood83/labsidian)";

export function requestHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "User-Agent": USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
    ...extra,
  };
}
