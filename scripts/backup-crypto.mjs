import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { command } from "./restore-target.mjs";
import { sealBackup, openBackup, sha256 } from "./backup-safety.mjs";

function dpapi(data, operation) {
  const script = `Add-Type -AssemblyName System.Security; [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::${operation}([Convert]::FromBase64String([Console]::In.ReadToEnd()), $null, [Security.Cryptography.DataProtectionScope]::CurrentUser))`;
  return Buffer.from(
    command(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { input: data.toString("base64") },
    ),
    "base64",
  );
}
export function saveBundle(directory, payload, context) {
  const key = randomBytes(32);
  const sealed = sealBackup(Buffer.from(JSON.stringify(payload)), key, context);
  writeFileSync(join(directory, "backup.aes-gcm"), sealed, { mode: 0o600 });
  const mode =
    process.platform === "win32"
      ? "windows-dpapi-current-user"
      : "ephemeral-ci";
  if (process.platform === "win32")
    writeFileSync(join(directory, "key.dpapi"), dpapi(key, "Protect"), {
      mode: 0o600,
    });
  return { key, mode, hash: sha256(sealed) };
}
export function readBundle(directory, manifest, ephemeralKey) {
  const sealed = readFileSync(join(directory, "backup.aes-gcm"));
  if (sha256(sealed) !== manifest.encryptedHash)
    throw Error("Encrypted backup checksum mismatch");
  const key =
    manifest.keyMode === "windows-dpapi-current-user" &&
    process.platform === "win32"
      ? dpapi(readFileSync(join(directory, "key.dpapi")), "Unprotect")
      : ephemeralKey;
  if (!key) throw Error("The ephemeral CI key is no longer available");
  return JSON.parse(openBackup(sealed, key, manifest.context));
}
