export type LocalAIBridgeClient = {
  complete(system: string, user: string): Promise<string>;
};

/** Creates a fail-closed client for the owner's private local AI bridge. */
export function createLocalAIBridgeClient(input: {
  url?: string;
  token?: string;
  accessClientId?: string;
  accessClientSecret?: string;
  fetcher?: typeof fetch;
}): LocalAIBridgeClient | undefined {
  if (!input.url && !input.token) return undefined;
  if (!input.url || !input.token) throw new Error("Configure both LOCAL_AI_BRIDGE_URL and LOCAL_AI_BRIDGE_TOKEN, or neither.");
  const endpoint = new URL(input.url);
  const localHost = endpoint.hostname === "localhost" || endpoint.hostname === "127.0.0.1";
  if (endpoint.protocol !== "https:" && !(endpoint.protocol === "http:" && localHost)) {
    throw new Error("Local AI Bridge requires HTTPS unless it targets localhost.");
  }
  if (endpoint.username || endpoint.password || endpoint.pathname !== "/" || endpoint.search || endpoint.hash) {
    throw new Error("LOCAL_AI_BRIDGE_URL must be an origin only (scheme and hostname, optional port).");
  }
  if (input.token.length < 32) throw new Error("Local AI Bridge token must contain at least 32 characters.");
  if (Boolean(input.accessClientId) !== Boolean(input.accessClientSecret)) {
    throw new Error("Configure both Cloudflare Access service-token values, or neither.");
  }

  const fetcher = input.fetcher ?? fetch;
  return {
    async complete(system, user) {
      const response = await fetcher(new URL("/v1/dj/turn", endpoint), {
        method: "POST",
        headers: {
          "authorization": "Bearer " + input.token,
          "content-type": "application/json",
          ...(input.accessClientId && input.accessClientSecret ? { "CF-Access-Client-Id": input.accessClientId, "CF-Access-Client-Secret": input.accessClientSecret } : {}),
        },
        body: JSON.stringify({ system, user }),
        signal: AbortSignal.timeout(95000),
      });
      let payload: { answer?: unknown; error?: unknown };
      try {
        payload = await response.json() as { answer?: unknown; error?: unknown };
      } catch {
        throw new Error("Local AI Bridge returned an invalid response.");
      }
      if (!response.ok) {
        const message = typeof payload.error === "string" ? payload.error : "Local AI Bridge returned HTTP " + response.status + ".";
        throw new Error(message);
      }
      if (typeof payload.answer !== "string" || !payload.answer.trim()) {
        throw new Error("Local AI Bridge returned no answer.");
      }
      return payload.answer.trim().slice(0, 8000);
    },
  };
}
