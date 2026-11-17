import { requestUrl, type RequestUrlResponse } from "obsidian";
import type { HttpClient, HttpRequest, HttpResponse } from "./types";

function headerMap(headers: RequestUrlResponse["headers"]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") result[key.toLowerCase()] = value;
  }
  return result;
}

export function createObsidianHttp(): HttpClient {
  return {
    async request(input: HttpRequest): Promise<HttpResponse> {
      const response = await requestUrl({
        url: input.url,
        method: input.method ?? "GET",
        headers: input.headers,
        body: input.body,
        throw: false,
      });
      return {
        status: response.status,
        headers: headerMap(response.headers),
        text: response.text,
        bytes: new Uint8Array(response.arrayBuffer),
      };
    },
  };
}
