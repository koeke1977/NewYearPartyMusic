export function extractDjTrackSuggestions(answer) {
  const normalizedAnswer = answer.replace(/\\n/g, "\n").replace(/\\r/g, "");
  return [...normalizedAnswer.matchAll(/^\s*\d+[.)]\s*(.+?)\s*$/gm)]
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
}
