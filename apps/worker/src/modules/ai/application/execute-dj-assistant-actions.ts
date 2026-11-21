import type { CatalogTrack } from "../../music/domain/catalog-track";

export type DJAssistantActionPorts = {
  searchTracks(query: string): Promise<CatalogTrack[]>;
  addTrack(trackId: string): Promise<{ status: number; body: Record<string, unknown> }>;
  readQueueIds(): Promise<string[]>;
  removeQueuedTrack(requestId: string): Promise<{ status: number; body: Record<string, unknown> }>;
  reorderQueue(order: string[]): Promise<{ ok: boolean; error?: { message: string }; value?: { order: string[] } }>;
};

export type DJAssistantActionResult = {
  type: "add_tracks" | "remove_tracks" | "reorder_queue";
  succeeded: number;
  alreadyPresent?: number;
  failed: number;
  details: string[];
};

type PlannedAction =
  | { type: "add_tracks"; tracks: Array<{ title: string; artist: string }> }
  | { type: "remove_tracks"; requestIds: string[] }
  | { type: "reorder_queue"; requestIds: string[] };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeTrackText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function parsePlannedAction(value: unknown): PlannedAction | null {
  const action = asRecord(value);
  if (!action || typeof action.type !== "string") return null;
  if (action.type === "add_tracks" && Array.isArray(action.tracks) && action.tracks.length > 0 && action.tracks.length <= 20) {
    const tracks = action.tracks.map(asRecord);
    if (tracks.some(track => !track || typeof track.title !== "string" || typeof track.artist !== "string"
      || !track.title.trim() || !track.artist.trim() || track.title.length > 140 || track.artist.length > 100)) return null;
    return { type: "add_tracks", tracks: tracks as Array<{ title: string; artist: string }> };
  }
  if ((action.type === "remove_tracks" || action.type === "reorder_queue")
    && Array.isArray(action.requestIds) && action.requestIds.length > 0 && action.requestIds.length <= 100
    && action.requestIds.every(id => typeof id === "string" && id.length > 0 && id.length <= 80)
    && new Set(action.requestIds).size === action.requestIds.length) {
    return action.type === "remove_tracks"
      ? { type: "remove_tracks", requestIds: action.requestIds as string[] }
      : { type: "reorder_queue", requestIds: action.requestIds as string[] };
  }
  return null;
}

/** Only explicit DJ commands can authorize mutations; suggestions and set plans remain read-only. */
export function detectDJActionIntent(prompt: string): { add: boolean; remove: boolean; reorder: boolean } {
  const text = prompt.toLocaleLowerCase("nl");
  const add = /\b(voeg|toevoegen|zet|plaats|stop|vul)\b/.test(text)
    && /\b(queue|partyqueue|wachtrij|up next|tracks?|nummers?|liedjes|schuurschijven|playlist|lijst|muziek)\b/.test(text);
  const remove = /\b(verwijder|haal|schrap|remove)\b/.test(text)
    && /\b(queue|partyqueue|wachtrij|up next|tracks?|nummers?|liedjes|uit)\b/.test(text);
  const reorder = /\b(herschik|herorden|herordeneer|verplaats|volgorde aanpassen|volgorde wijzigen|reorder)\b/.test(text);
  return { add, remove, reorder };
}

export function parseDJAssistantActionEnvelope(raw: string): { answer: string; actions: PlannedAction[] } | null {
  try {
    const parsed = asRecord(JSON.parse(raw));
    if (!parsed || typeof parsed.answer !== "string" || !Array.isArray(parsed.actions) || parsed.actions.length > 3) return null;
    const actions = parsed.actions.map(parsePlannedAction);
    if (actions.some(action => action === null)) return null;
    return { answer: parsed.answer.slice(0, 6000), actions: actions as PlannedAction[] };
  } catch {
    return null;
  }
}

function exactSpotifyMatch(track: CatalogTrack, requested: { title: string; artist: string }): boolean {
  const expectedTitle = normalizeTrackText(requested.title);
  const expectedArtist = normalizeTrackText(requested.artist);
  return normalizeTrackText(track.name) === expectedTitle
    && track.artists.some(artist => normalizeTrackText(artist) === expectedArtist);
}

/** Executes model proposals through existing catalogue and PartyQueue application workflows. */
export async function executeDJAssistantActions(input: {
  prompt: string;
  actions: unknown[];
  ports: DJAssistantActionPorts;
}): Promise<DJAssistantActionResult[]> {
  const intent = detectDJActionIntent(input.prompt);
  const results: DJAssistantActionResult[] = [];

  for (const rawAction of input.actions.slice(0, 3)) {
    const action = parsePlannedAction(rawAction);
    if (!action) continue;

    if (action.type === "add_tracks") {
      if (!intent.add) continue;
      const result: DJAssistantActionResult = { type: action.type, succeeded: 0, alreadyPresent: 0, failed: 0, details: [] };
      for (const requested of action.tracks) {
        try {
          const matches = await input.ports.searchTracks(requested.title + " " + requested.artist);
          const exact = matches.find(track => exactSpotifyMatch(track, requested));
          if (!exact) {
            result.failed++;
            result.details.push(requested.title + " — " + requested.artist + ": geen exacte Spotify-match gevonden");
            continue;
          }
          const added = await input.ports.addTrack(exact.id);
          if (added.status >= 200 && added.status < 300 && added.body.ok === true) {
            if (added.body.alreadyQueued === true) {
              result.alreadyPresent = (result.alreadyPresent || 0) + 1;
              result.details.push(requested.title + " — " + requested.artist + ": stond al in PartyQueue");
            } else {
              result.succeeded++;
              result.details.push(requested.title + " — " + requested.artist + ": toegevoegd");
            }
          } else {
            result.failed++;
            result.details.push(requested.title + " — " + requested.artist + ": " + String(added.body.error || "toevoegen mislukt"));
          }
        } catch {
          result.failed++;
          result.details.push(requested.title + " — " + requested.artist + ": Spotify tijdelijk niet beschikbaar");
        }
      }
      results.push(result);
      continue;
    }

    if (action.type === "remove_tracks") {
      if (!intent.remove) continue;
      const result: DJAssistantActionResult = { type: action.type, succeeded: 0, failed: 0, details: [] };
      for (const requestId of action.requestIds) {
        const currentQueue = await input.ports.readQueueIds();
        if (!currentQueue.includes(requestId)) {
          result.failed++;
          result.details.push(requestId + ": staat niet (meer) in PartyQueue");
          continue;
        }
        const removed = await input.ports.removeQueuedTrack(requestId);
        if (removed.status >= 200 && removed.status < 300 && removed.body.ok === true) {
          result.succeeded++;
        } else {
          result.failed++;
          result.details.push(requestId + ": " + String(removed.body.error || "verwijderen mislukt"));
        }
      }
      results.push(result);
      continue;
    }

    if (action.type === "reorder_queue") {
      if (!intent.reorder) continue;
      const currentQueue = await input.ports.readQueueIds();
      if (action.requestIds.length !== currentQueue.length
        || currentQueue.some(id => !action.requestIds.includes(id))) {
        results.push({
          type: action.type, succeeded: 0, failed: 1,
          details: ["De wachtrij is gewijzigd of de AI gaf geen volledige volgorde; er is niets herschikt."],
        });
        continue;
      }
      const reordered = await input.ports.reorderQueue(action.requestIds);
      results.push(reordered.ok
        ? { type: action.type, succeeded: 1, failed: 0, details: ["De volledige PartyQueue-volgorde is bijgewerkt."] }
        : { type: action.type, succeeded: 0, failed: 1, details: [reordered.error?.message || "Herschikken mislukt."] });
    }
  }
  return results;
}
