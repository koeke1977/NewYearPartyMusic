export function createDjApi(getToken, fetcher = fetch) {
  return async function api(path, options = {}) {
    const response = await fetcher(path, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: "Bearer " + getToken(),
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    const data = await response.json().catch(() => ({ error: "Ongeldig antwoord van server." }));
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  };
}
