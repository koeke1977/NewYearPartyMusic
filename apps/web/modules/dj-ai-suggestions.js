export function extractDjTrackSuggestions(answer, spotifyMatches = []) {
  const normalizedAnswer = answer.replace(/\\n/g, "\n").replace(/\\r/g, "");
  const suggestions = [...normalizedAnswer.matchAll(/^\s*\d+[.)]\s*(.+?)\s*$/gm)]
    .map((match) => match[1]
      .replace(/\*+/g, "")
      .replace(/\s*\([^)]*\)\s*$/, "")
      .replace(/[\u2013\u2014]/g, " — ")
      .replace(/\s+/g, " ")
      .trim())
    .filter((line) => line.includes("—") || line.includes("-"))
    .map((line) => line.replace(/^\s*[-•]\s*/, "").trim().slice(0, 140))
    .filter((line) => line.length > 2)
    .slice(0, 20);

  if (!suggestions.length && spotifyMatches.length) {
    for (const group of spotifyMatches) suggestions.push(group.query);
  }
  return suggestions;
}
