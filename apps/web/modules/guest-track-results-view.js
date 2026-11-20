import { element } from "./dom.js";

// Renders Spotify search results with a direct Spotify content link and delegates requests.
export function renderGuestTrackResults(results, tracks, onRequest, elementFactory = element) {
  results.replaceChildren();
  for (const track of tracks) {
    const item = elementFactory("article", "track-item");
    if (track.albumImageUrl) {
      const image = elementFactory("img", "track-cover");
      image.src = track.albumImageUrl;
      image.alt = "Albumcover";
      image.loading = "lazy";
      item.append(image);
    } else {
      item.append(elementFactory("div", "track-cover track-cover-empty", "♪"));
    }

    const details = elementFactory("div", "track-details");
    const spotifyLink = elementFactory("a", "spotify-content-link");
    spotifyLink.href = "https://open.spotify.com/track/" + encodeURIComponent(track.id);
    spotifyLink.target = "_blank";
    spotifyLink.rel = "noopener noreferrer";
    spotifyLink.append(
      elementFactory("strong", "track-name", track.name),
      elementFactory("span", "track-artist", track.artists.join(", ")),
    );
    details.append(spotifyLink);
    const duration = Math.floor(track.durationMs / 60000) + ":" +
      String(Math.floor(track.durationMs / 1000) % 60).padStart(2, "0");
    details.append(elementFactory("span", "track-duration", duration));

    const requestButton = elementFactory("button", "request-button", "AANVRAGEN");
    requestButton.type = "button";
    requestButton.addEventListener("click", () => onRequest(track, requestButton));
    item.append(details, requestButton);
    results.append(item);
  }
}
