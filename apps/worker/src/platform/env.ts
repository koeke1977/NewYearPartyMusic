export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  EVENT_ID: string;
  EVENT_NAME: string;
  APP_ENV: string;
  PUBLIC_ORIGIN: string;
  QUEUE_ROOM: DurableObjectNamespace;
  EVENT_ACCESS_CODE_HASH: string;
  DJ_ACCESS_CODE_HASH: string;
  SESSION_SECRET: string;
  SPOTIFY_CLIENT_ID: string;
  SPOTIFY_CLIENT_SECRET: string;
  AI?: { run(model: string, input: Record<string, unknown>): Promise<any> };  LOCAL_AI_BRIDGE_URL?: string;
  LOCAL_AI_BRIDGE_TOKEN?: string;
}
