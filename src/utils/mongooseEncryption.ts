import crypto from "crypto";
import { Schema } from "mongoose";

const ENC_PREFIX = "enc:v1:";
let encryptionKey: string | null = null;

export function setEncryptionKey(key: string): void {
  if (key && key.trim()) {
    encryptionKey = key.trim();
  }
}

function getKeyBuffer(): Buffer {
  if (!encryptionKey) {
    throw new Error("Encryption key not initialized");
  }
  return crypto.createHash("sha256").update(encryptionKey).digest();
}

export function encryptField(value?: string | null): string | undefined | null {
  if (value === undefined || value === null || value === "") {
    return value as string | undefined | null;
  }
  if (!encryptionKey) {
    return value;
  }
  if (typeof value === "string" && value.startsWith(ENC_PREFIX)) {
    return value;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKeyBuffer(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, tag, encrypted]).toString("base64");
  return `${ENC_PREFIX}${payload}`;
}

function decryptLegacyField(value: string): string | undefined {
  try {
    const parts = value.split(":");
    if (parts.length !== 2) return undefined;
    const [ivHex, encryptedHex] = parts;
    if (ivHex.length !== 32) return undefined; // 16 bytes IV is 32 hex chars

    const decipher = crypto.createDecipheriv("aes-256-cbc", getKeyBuffer(), Buffer.from(ivHex, "hex"));
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return undefined;
  }
}

export function decryptField(value?: string | null): string | undefined | null {
  if (value === undefined || value === null || value === "") {
    return value as string | undefined | null;
  }
  if (typeof value !== "string") {
    return value;
  }
  if (!value.startsWith(ENC_PREFIX)) {
    if (!encryptionKey) {
      return value;
    }
    if (value.includes(":")) {
      const legacyDecrypted = decryptLegacyField(value);
      if (legacyDecrypted !== undefined) {
        return legacyDecrypted;
      }
    }
    return value;
  }
  if (!encryptionKey) {
    return value;
  }
  try {
    const raw = Buffer.from(value.slice(ENC_PREFIX.length), "base64");
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", getKeyBuffer(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return value;
  }
}

function decryptDocFields(doc: any, fields: string[]): void {
  if (!doc) return;
  for (const field of fields) {
    if (doc[field]) {
      doc[field] = decryptField(doc[field]);
    }
  }
}

export function applyFieldEncryption(schema: Schema, fields: string[]): void {
  schema.pre("save", function (next) {
    try {
      for (const field of fields) {
        if (this.isModified(field) && this.get(field)) {
          this.set(field, encryptField(this.get(field)));
        }
      }
      next();
    } catch (error) {
      next(error as Error);
    }
  });

  /* 🔐 Encrypt on update queries */
  const encryptUpdate = function (this: any, next: any) {
    try {
      const update = this.getUpdate();
      if (!update) {
        return next();
      }

      for (const field of fields) {
        if (update[field] !== undefined && update[field] !== null) {
          update[field] = encryptField(update[field]);
        }
        if (update.$set && update.$set[field] !== undefined && update.$set[field] !== null) {
          update.$set[field] = encryptField(update.$set[field]);
        }
      }
      next();
    } catch (error) {
      next(error as Error);
    }
  };

  schema.pre("findOneAndUpdate", encryptUpdate);
  schema.pre("updateOne", encryptUpdate);
  schema.pre("updateMany", encryptUpdate);

  schema.post("find", function (docs: any[]) {
    if (Array.isArray(docs)) {
      docs.forEach((doc) => decryptDocFields(doc, fields));
    }
  });

  schema.post("findOne", function (doc: any) {
    decryptDocFields(doc, fields);
  });

  schema.post("findOneAndUpdate", function (doc: any) {
    decryptDocFields(doc, fields);
  });

  schema.post("findOneAndDelete", function (doc: any) {
    decryptDocFields(doc, fields);
  });
}

/** Legacy aliases used by migration scripts (e.g. encryptHistoricalData.ts). */
export const encrypt = encryptField;
export const decrypt = decryptField;
export const applyEncryption = applyFieldEncryption;
