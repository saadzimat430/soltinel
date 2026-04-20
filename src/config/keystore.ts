import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from "node:crypto";
import { homedir } from "node:os";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const DIR = path.join(homedir(), ".soltinel");
export const KEYSTORE_PATH = path.join(DIR, "keystore.json");

interface Keystore {
  version: 1;
  kdf: "scrypt";
  kdfparams: { N: number; r: number; p: number; salt: string };
  cipher: "aes-256-gcm";
  iv: string;
  ciphertext: string;
  authTag: string;
}

export function keystoreExists(): boolean {
  return existsSync(KEYSTORE_PATH);
}

// 128 * N * r = memory in bytes. maxmem must exceed that; 64 MB gives 2× headroom.
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

export function encryptKey(privateKey: string, password: string): void {
  const salt    = randomBytes(32);
  const iv      = randomBytes(12);
  const derived = scryptSync(password, salt, 32, SCRYPT);
  const cipher  = createCipheriv("aes-256-gcm", derived, iv);
  const ct      = Buffer.concat([cipher.update(privateKey, "utf8"), cipher.final()]);

  const store: Keystore = {
    version: 1,
    kdf: "scrypt",
    kdfparams: { N: 32768, r: 8, p: 1, salt: salt.toString("hex") },
    cipher: "aes-256-gcm",
    iv:         iv.toString("hex"),
    ciphertext: ct.toString("hex"),
    authTag:    cipher.getAuthTag().toString("hex"),
  };

  mkdirSync(DIR, { recursive: true });
  writeFileSync(KEYSTORE_PATH, JSON.stringify(store, null, 2), { mode: 0o600 });
}

export function decryptKey(password: string): string {
  const store   = JSON.parse(readFileSync(KEYSTORE_PATH, "utf8")) as Keystore;
  const salt    = Buffer.from(store.kdfparams.salt, "hex");
  const derived = scryptSync(password, salt, 32, {
    N: store.kdfparams.N, r: store.kdfparams.r, p: store.kdfparams.p,
    maxmem: 64 * 1024 * 1024,
  });
  const dec = createDecipheriv("aes-256-gcm", derived, Buffer.from(store.iv, "hex"));
  dec.setAuthTag(Buffer.from(store.authTag, "hex"));
  try {
    return Buffer.concat([
      dec.update(Buffer.from(store.ciphertext, "hex")),
      dec.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Wrong password — cannot decrypt keystore.");
  }
}
