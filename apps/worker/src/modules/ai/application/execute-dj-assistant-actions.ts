import type { CatalogTrack } from "../../music/domain/catalog-track";

export type DJAssistantActionPorts = {
  searchTracks(query: string): Promise<CatalogTrack[]>;
  addTrack(trackId: string): Promise<{ status: number; body: Record<string, unknown> }>;
  readQueueIds?(): Promise<string[]>;
  readQueueTracks?(): Promise<Array<{ id: string; track_name: string; artist_name: string }>>;
  removeQueuedTrack?(requestId: string): Promise<{ status: number; body: Record<string, unknown> }>;
  reorderQueue?(order: string[]): Promise<{ ok: boolean; error?: { message: string }; value?: { order: string[] } }>;
  canContinue?(): Promise<boolean>;
  isTrackAllowed?(track: CatalogTrack): boolean;
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
  if (action.type === "remove_tracks") {
    const requestIds = action.requestIds === undefined ? [] : action.requestIds;
    if (!Array.isArray(requestIds) || requestIds.length > 100
      || !requestIds.every(id => typeof id === "string" && id.length > 0 && id.length <= 80)
      || new Set(requestIds).size !== requestIds.length) return null;
    return { type: "remove_tracks", requestIds: requestIds as string[] };
  }
  if (action.type === "reorder_queue" && Array.isArray(action.requestIds)
    && action.requestIds.length > 0 && action.requestIds.length <= 100
    && action.requestIds.every(id => typeof id === "string" && id.length > 0 && id.length <= 80)
    && new Set(action.requestIds).size === action.requestIds.length) {
    return { type: "reorder_queue", requestIds: action.requestIds as string[] };
  }
  return null;
}

/** Only explicit DJ commands can authorize mutations; suggestions and set plans remain read-only. */
export function detectDJActionIntent(prompt: string): { add: boolean; remove: boolean; reorder: boolean } {
  const text = prompt.toLocaleLowerCase("nl");
  const explicitListAdd = /\b(voeg|toevoegen)\b/.test(text)
    && /\b(lijst|selectie)\b/.test(text)
    && /\btoe\b/.test(text);
  const add = /\b(voeg|toevoegen|zet|plaats|stop|vul)\b/.test(text)
    && (/\b(queue|partyqueue|wachtrij|up next)\b/.test(text)
      || /\b(tracks?|nummers?|liedjes|songs|hits|schuurschijven)\b/.test(text)
      || /\bzet\s+\d+\s+\w+/.test(text)
      || explicitListAdd);
  const removeVerb = /\b(verwijder(?:en)?|haal|schrap(?:pen)?|gooi|gooien|wis|wissen|remove)\b/.test(text);
  const removeTarget = /\b(queue|partyqueue|wachtrij|up next|tracks?|nummers?|liedjes)\b/.test(text);
  const remove = removeVerb && (removeTarget || /\b(eruit|uit de lijst|uit de queue)\b/.test(text)
    || /\b(schrap(?:pen)?|gooi|gooien|wis(?:sen)?)\b/.test(text)
    || /^(?:ik wil(?: graag)?\s+)?verwijder\s+\S+/.test(text));
  const reorder = /\b(herschik|herorden|herordeneer|verplaats|volgorde aanpassen|volgorde wijzigen|reorder)\b/.test(text);
  return { add, remove, reorder };
}

/** Extracts an explicit artist/title target from a Dutch removal command. */
export function extractDJRemovalTarget(prompt: string): string | null {
  let target = prompt.trim().replace(/[.!?]+$/g, "").toLocaleLowerCase("nl");
  target = target.replace(/^(?:(?:ik wil(?: graag)?|kun je|kan je|graag|aub|alsjeblieft)\s+)*/, "");
  target = target.replace(/^(?:verwijder(?:en)?|schrap(?:pen)?|haal|gooi|gooien|wis|wissen|remove)\s+/, "");
  target = target.replace(/\s+(?:uit|uit de|uit mijn|uit onze|uit het)\s+(?:de\s+)?(?:partyqueue|queue|wachtrij|up next|lijst).*$/i, "");
  target = target.replace(/\s+(?:eruit|weg|uit de lijst|uit de queue|uit partyqueue)$/i, "");
  target = target.replace(/^(?:(?:al|alle|de|het|die|deze|mijn|onze)\s+)*/i, "");
  target = target.replace(/^(?:nummers?|tracks?|liedjes|songs?)\s+(?:van|door)\s+/i, "");
  target = target.replace(/\s*[-–—]?\s*(?:nummers?|tracks?|liedjes|songs?)$/i, "");
  target = target.replace(/\s+/g, " ").trim();
  const normalized = normalizeTrackText(target);
  if (!normalized || /^(?:deze|die|alle|nummers|tracks|liedjes|songs|muziek)$/.test(normalized)) return null;
  return normalized;
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
    if (input.ports.canContinue && !await input.ports.canContinue()) break;
    const action = parsePlannedAction(rawAction);
    if (!action) continue;

    if (action.type === "add_tracks") {
      if (!intent.add) continue;
      const result: DJAssistantActionResult = { type: action.type, succeeded: 0, alreadyPresent: 0, failed: 0, details: [] };
      for (const requested of action.tracks) {
        if (input.ports.canContinue && !await input.ports.canContinue()) {
          result.details.push("Autopilot is gestopt of de wachtrij is vol; verdere toevoegingen zijn gestopt.");
          break;
        }
        try {
          const matches = await input.ports.searchTracks(requested.title + " " + requested.artist);
          if (input.ports.canContinue && !await input.ports.canContinue()) {
            result.details.push("Autopilot is gestopt of de wachtrij is vol; de gevonden track is niet toegevoegd.");
            break;
          }
          const exact = matches.find(track => exactSpotifyMatch(track, requested));
          if (exact && input.ports.isTrackAllowed && !input.ports.isTrackAllowed(exact)) {
            result.failed++;
            result.details.push(requested.title + " — " + requested.artist + ": overgeslagen wegens recente herhaling");
            continue;
          }
          if (!exact) {
            result.failed++;
            result.details.push(requested.title + " — " + requested.artist + ": geen exacte Spotify-match gevonden");
            continue;
          }
          if (input.ports.canContinue && !await input.ports.canContinue()) {
            result.details.push("Autopilot is gestopt of de wachtrij is vol; de track is niet toegevoegd.");
            break;
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
      if (!input.ports.readQueueTracks || !input.ports.removeQueuedTrack) {
        results.push({ type: action.type, succeeded: 0, failed: 1, details: ["Verwijderen is niet beschikbaar voor deze uitvoerder."] });
        continue;
      }
      const target = extractDJRemovalTarget(input.prompt);
      if (!target) {
        results.push({ type: action.type, succeeded: 0, failed: 1, details: ["Ik kan niet veilig bepalen welke artiest of track je bedoelt. Er is niets gewijzigd."] });
        continue;
      }
      let liveTracks: Array<{ id: string; track_name: string; artist_name: string }>;
      try {
        liveTracks = await input.ports.readQueueTracks();
      } catch {
        results.push({ type: action.type, succeeded: 0, failed: 1, details: ["De actuele PartyQueue kon niet worden gelezen. Er is niets gewijzigd."] });
        continue;
      }
      const matches = liveTracks.filter(track => {
        const artist = normalizeTrackText(track.artist_name);
        const title = normalizeTrackText(track.track_name);
        return artist === target || artist.includes(" " + target) || title === target;
      });
      if (!matches.length) {
        results.push({ type: action.type, succeeded: 0, failed: 0, details: ["Geen exacte artiest- of titelmatch gevonden voor ‘" + target + "’. PartyQueue is ongewijzigd."] });
        continue;
      }
      const result: DJAssistantActionResult = { type: action.type, succeeded: 0, failed: 0, details: [] };
      for (const track of matches) {
        try {
          const currentQueue = await input.ports.readQueueTracks();
          if (!currentQueue.some(item => item.id === track.id)) {
            result.failed++;
            result.details.push(track.track_name + " — " + track.artist_name + ": staat niet (meer) in PartyQueue");
            continue;
          }
          const removed = await input.ports.removeQueuedTrack(track.id);
          if (removed.status < 200 || removed.status >= 300 || removed.body.ok !== true) {
            result.failed++;
            result.details.push(track.track_name + " — " + track.artist_name + ": " + String(removed.body.error || "verwijderen mislukt"));
            continue;
          }
          const queueAfterRemoval = await input.ports.readQueueTracks();
          if (queueAfterRemoval.some(item => item.id === track.id)) {
            result.failed++;
            result.details.push(track.track_name + " — " + track.artist_name + ": Worker bevestigde de actie, maar de track staat nog in PartyQueue");
            continue;
          }
          result.succeeded++;
          result.details.push(track.track_name + " — " + track.artist_name + ": verwijderd en gecontroleerd");
        } catch (error) {
          result.failed++;
          result.details.push(track.track_name + " — " + track.artist_name + ": " + (error instanceof Error ? error.message : "verwijderen mislukt"));
        }
      }
      results.push(result);
      continue;
    }

    if (action.type === "reorder_queue") {
      if (!intent.reorder) continue;
      if (!input.ports.readQueueIds || !input.ports.reorderQueue) {
        results.push({ type: action.type, succeeded: 0, failed: 1, details: ["Herschikken is niet beschikbaar voor deze uitvoerder."] });
        continue;
      }
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
