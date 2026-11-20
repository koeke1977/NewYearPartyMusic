import { clearDjToken, getSavedDjToken, saveDjToken } from "./dj-session.js";

// Owns DJ login, persisted token lifecycle and visibility of the authenticated console.
export function createDjAuthController({
  loginCard,
  loginForm,
  loginMessage,
  consoleView,
  onStateChange = () => {},
  fetchImpl = fetch,
  FormDataImpl = FormData,
}) {
  let token = getSavedDjToken();

  function setLoggedIn(enabled) {
    loginCard.hidden = enabled;
    consoleView.hidden = !enabled;
    onStateChange(enabled);
  }

  function logout() {
    token = "";
    clearDjToken();
    setLoggedIn(false);
  }

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    const button = loginForm.querySelector("button");
    button.disabled = true;
    loginMessage.textContent = "Checking DJ access…";
    try {
      const response = await fetchImpl("/api/dj/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: new FormDataImpl(loginForm).get("code") }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Login failed");
      token = data.token;
      saveDjToken(token);
      loginForm.reset();
      loginMessage.textContent = "";
      setLoggedIn(true);
    } catch (error) {
      loginMessage.textContent = error.message;
    } finally {
      button.disabled = false;
    }
  });

  return {
    getToken: () => token,
    hasToken: () => Boolean(token),
    logout,
    setLoggedIn,
  };
}
