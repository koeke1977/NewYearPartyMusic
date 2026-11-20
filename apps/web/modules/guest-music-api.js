// Owns the guest-facing Spotify search and request API contracts.
export async function searchGuestTracks(query, token, signal, fetchImpl = fetch) {
  const response = await fetchImpl("/api/spotify/search?q=" + encodeURIComponent(query), {
    headers: { Authorization: "Bearer " + token },
    signal,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Zoeken is niet gelukt.");
  return data;
}

export async function submitGuestTrackRequest(trackId, token, fetchImpl = fetch) {
  const response = await fetchImpl("/api/requests", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({ trackId }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Aanvragen is niet gelukt.");
  return data;
}
