import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  decryptSecret,
  encryptSecret,
  fromBase64Url,
  sha256,
  toBase64Url,
} from "../../apps/worker/src/platform/security/crypto";

const encoder = new TextEncoder();

async function legacyEncrypt(value: string, secret: string): Promise<string> {
  const raw = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(value));
  const bytes = new Uint8Array([...iv, ...new Uint8Array(encrypted)]);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function legacyDecrypt(value: string, secret: string): Promise<string> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  const iv = bytes.slice(0, 12);
  const ciphertext = bytes.slice(12);
  const raw = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

describe("platform security crypto", () => {
  it("round-trips base64url without padding", () => {
    const input = encoder.encode("PartyQueue · DJ#DATUUR");
    expect(fromBase64Url(toBase64Url(input))).toEqual(input);
  });

  it("computes SHA-256 using the existing lowercase hex representation", async () => {
    expect(await sha256("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("compares signatures without early character mismatch exits", () => {
    expect(constantTimeEqual("same-signature", "same-signature")).toBe(true);
    expect(constantTimeEqual("same-signature", "same-signaturE")).toBe(false);
    expect(constantTimeEqual("short", "longer")).toBe(false);
  });

  it("decrypts Spotify tokens encrypted by the pre-refactor implementation", async () => {
    const ciphertext = await legacyEncrypt("spotify-refresh-token-value", "existing-session-secret");
    await expect(decryptSecret(ciphertext, "existing-session-secret")).resolves.toBe("spotify-refresh-token-value");
  });

  it("keeps newly encrypted Spotify tokens readable by the pre-refactor format", async () => {
    const ciphertext = await encryptSecret("spotify-access-token-value", "existing-session-secret");
    await expect(legacyDecrypt(ciphertext, "existing-session-secret")).resolves.toBe("spotify-access-token-value");
  });

  it("rejects decryption with a different secret", async () => {
    const ciphertext = await encryptSecret("sensitive-token", "correct-secret");
    await expect(decryptSecret(ciphertext, "wrong-secret")).rejects.toThrow();
  });
});
