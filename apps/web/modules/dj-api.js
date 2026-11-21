export function createDjApi(getToken, fetcher = fetch) {
  return async function api(path, options = {}) {
    const { timeoutMs = 30000, ...requestOptions } = options;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetcher(path, {
        ...requestOptions,
        signal: controller.signal,
        headers: {
          ...(requestOptions.headers || {}),
          Authorization: "Bearer " + getToken(),
          ...(requestOptions.body ? { "Content-Type": "application/json" } : {}),
        },
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error("De aanvraag duurde te lang. Probeer het opnieuw.");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    const data = await response.json().catch(() => ({ error: "Ongeldig antwoord van server." }));
    if (!response.ok) throw new Error(data.error || "Request failed");
    return data;
  };
}
