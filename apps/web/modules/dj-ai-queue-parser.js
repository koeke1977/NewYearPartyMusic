function normalizeTrackText(value) {
  return value.toLocaleLowerCase("nl")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseProposedTrack(line) {
  const emDash = line.lastIndexOf("—") >= 0 ? line.lastIndexOf("—") : line.lastIndexOf("–");
  const split = emDash >= 0 ? emDash : line.lastIndexOf(" - ");
  if (split < 0) return null;
  let title = line.slice(0, split).trim();
  const artist = line.slice(split + (emDash >= 0 ? 1 : 3)).trim();
  title = title
    .replace(/\s+-\s+(?:from\b|edit\b|original version\b).*$/i, "")
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();
  return title && artist
    ? { title: normalizeTrackText(title), artist: normalizeTrackText(artist) }
    : null;
}

export function matchDjQueueProposal(answer, queued) {
  const lines = [...answer.matchAll(/^\s*\d+[.)]\s*(.+?)\s*$/gm)].map((match) =>
    match[1].replace(/\*+/g, "").trim(),
  );
  const unused = new Set(queued.map((track) => track.id));
  const unmatchedLines = [];
  const ids = lines.map((line) => {
    const parsed = parseProposedTrack(line);
    if (!parsed) {
      unmatchedLines.push(line);
      return null;
    }
    let best = null;
    let bestScore = 0;
    const titleOnlyCandidates = [];
    for (const track of queued) {
      if (!unused.has(track.id)) continue;
      const title = normalizeTrackText(track.track_name);
      const artist = normalizeTrackText(track.artist_name);
      const titleMatch = title === parsed.title ||
        title.startsWith(parsed.title + " ") ||
        parsed.title.startsWith(title + " ");
      const artistMatch = artist === parsed.artist ||
        artist.includes(parsed.artist) ||
        parsed.artist.includes(artist);
      if (titleMatch) titleOnlyCandidates.push(track);
      const score = (title === parsed.title ? 4 : titleMatch ? 2 : 0) + (artistMatch ? 3 : 0);
      if (titleMatch && artistMatch && score > bestScore) {
        best = track;
        bestScore = score;
      }
    }
    // If the AI supplied the wrong artist, accept the title only when exactly one unused queued track matches it.
    if (!best && titleOnlyCandidates.length === 1) best = titleOnlyCandidates[0];
    if (best) {
      unused.delete(best.id);
      return best.id;
    }
    unmatchedLines.push(line);
    return null;
  }).filter(Boolean);
  return { ids, unmatchedLines };
}
