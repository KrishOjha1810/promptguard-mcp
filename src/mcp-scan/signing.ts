import {
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
  createPublicKey,
  createPrivateKey,
  createHash,
  type KeyObject,
} from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

// Ed25519 signing for the audit chain. Built-in crypto only, no dependencies.
//
// What signing buys us: every record is signed by the holder of the local
// private key, so the chain is non-repudiable and a record cannot be forged
// without the key. What it does NOT buy on its own: protection against a local
// attacker who can read the private key and re-sign a rewritten chain. That is
// what ANCHORING is for, recording the chain head externally (a git commit, a
// written-down digest) so a later rewrite no longer matches the anchor.

export type Keypair = {
  publicKeyPem: string;
  privateKeyPem: string;
  fingerprint: string; // sha256 of the public key DER, short hex
};

function fingerprintOf(publicKey: KeyObject): string {
  const der = publicKey.export({ type: "spki", format: "der" }) as Buffer;
  return createHash("sha256").update(der).digest("hex").slice(0, 16);
}

export function generateKeypair(): Keypair {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }) as string,
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }) as string,
    fingerprint: fingerprintOf(publicKey),
  };
}

export function defaultKeyDir(): string {
  return join(homedir(), ".promptguard");
}

// Load the local signing keypair, generating and persisting one on first use.
// The private key file is written with 0600 permissions.
export function ensureKeypair(dir = defaultKeyDir()): Keypair {
  const privPath = join(dir, "signing-key.pem");
  const pubPath = join(dir, "signing-key.pub.pem");
  if (existsSync(privPath) && existsSync(pubPath)) {
    const privateKeyPem = readFileSync(privPath, "utf8");
    const publicKeyPem = readFileSync(pubPath, "utf8");
    return { privateKeyPem, publicKeyPem, fingerprint: fingerprintOf(createPublicKey(publicKeyPem)) };
  }
  const kp = generateKeypair();
  mkdirSync(dir, { recursive: true });
  writeFileSync(privPath, kp.privateKeyPem);
  try {
    chmodSync(privPath, 0o600);
  } catch {
    /* best effort on platforms without chmod */
  }
  writeFileSync(pubPath, kp.publicKeyPem);
  return kp;
}

export function signData(data: string, privateKeyPem: string): string {
  const key = createPrivateKey(privateKeyPem);
  return cryptoSign(null, Buffer.from(data, "utf8"), key).toString("base64");
}

export function verifyData(data: string, signatureB64: string, publicKeyPem: string): boolean {
  try {
    const key = createPublicKey(publicKeyPem);
    return cryptoVerify(null, Buffer.from(data, "utf8"), key, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

export function loadPublicKey(path: string): string {
  return readFileSync(path, "utf8");
}

export function defaultPublicKeyPath(dir = defaultKeyDir()): string {
  return join(dir, "signing-key.pub.pem");
}

// ---------------------------------------------------------------------------
// Anchoring: a short, externally-recordable digest of the chain head. Record
// it somewhere the local process cannot retroactively change (commit it to git,
// write it down). A later rewrite of the log changes the head, so it no longer
// matches the anchor you recorded.
// ---------------------------------------------------------------------------

export type Anchor = {
  headHash: string;
  recordCount: number;
  fingerprint: string | null;
  token: string; // compact "pg-anchor:v1:<count>:<fp>:<headHash>"
};

export function makeAnchor(headHash: string, recordCount: number, fingerprint: string | null): Anchor {
  const fp = fingerprint ?? "nosig";
  return {
    headHash,
    recordCount,
    fingerprint,
    token: `pg-anchor:v1:${recordCount}:${fp}:${headHash}`,
  };
}

export function parseAnchorToken(token: string): { recordCount: number; fingerprint: string; headHash: string } | null {
  const m = token.trim().match(/^pg-anchor:v1:(\d+):([^:]+):(.+)$/);
  if (!m) return null;
  return { recordCount: Number(m[1]), fingerprint: m[2], headHash: m[3] };
}

// Append an anchor to a local append-only history (a convenience, not a
// security boundary; the real anchor is whatever you record externally).
export function appendAnchorHistory(anchor: Anchor, dir = defaultKeyDir()): void {
  try {
    mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({ token: anchor.token, headHash: anchor.headHash, count: anchor.recordCount }) + "\n";
    const path = join(dir, "anchors.log");
    const prev = existsSync(path) ? readFileSync(path, "utf8") : "";
    writeFileSync(path, prev + line);
  } catch {
    /* best effort */
  }
}
