import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { resolve, relative, isAbsolute } from "node:path";

export function restoreIdentity(root) {
  return (
    "client-portal-restore-" +
    createHash("sha256").update(resolve(root)).digest("hex").slice(0, 8)
  );
}
export function assertRestoreOwner(owner, root, config, linked) {
  const lines = config.split(/\r?\n/);
  if (
    owner.root !== resolve(root) ||
    owner.projectId !== restoreIdentity(root) ||
    linked ||
    !lines.includes(`project_id = "${owner.projectId}"`) ||
    !lines.includes("port = 57321") ||
    !lines.includes("port = 57322")
  )
    throw Error("Refusing an unowned or linked restore environment");
}
export function assertLocalRestoreStatus(status) {
  if (
    status.API_URL !== "http://127.0.0.1:57321" ||
    !status.PUBLISHABLE_KEY ||
    !status.SECRET_KEY
  )
    throw Error("Dedicated restore API and credentials required");
  const url = new URL(status.DB_URL);
  if (
    url.hostname !== "127.0.0.1" ||
    url.port !== "57322" ||
    url.pathname !== "/postgres"
  )
    throw Error("Dedicated restore database required");
}
export function assertBackupPath(base, candidate) {
  const suffix = relative(resolve(base), resolve(candidate));
  if (!suffix || suffix.startsWith("..") || isAbsolute(suffix))
    throw Error("Backup path must be inside its owned directory");
}
export const sha256 = (data) => createHash("sha256").update(data).digest("hex");

export function sealBackup(data, key, context) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.from(
    JSON.stringify({
      format: "client-portal-drill-v1",
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    }),
  );
}
export function openBackup(envelope, key, context) {
  const sealed = JSON.parse(envelope.toString());
  if (sealed.format !== "client-portal-drill-v1")
    throw Error("Unsupported backup format");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(sealed.iv, "base64"),
  );
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]);
}
