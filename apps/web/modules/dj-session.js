const DJ_TOKEN_KEY = "partyqueue_dj_token";

export function getSavedDjToken(storage = localStorage) {
  return storage.getItem(DJ_TOKEN_KEY) || "";
}

export function saveDjToken(token, storage = localStorage) {
  storage.setItem(DJ_TOKEN_KEY, token);
}

export function clearDjToken(storage = localStorage) {
  storage.removeItem(DJ_TOKEN_KEY);
}
