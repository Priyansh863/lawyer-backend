import crypto from "crypto";

import dbConfig from "../config/secretManagerConfig";
import type { ISecretManagerData } from "../Interfaces/commonInterfaces";

const ALGORITHM = "aes-256-cbc";

let SECRET_KEY: Buffer | null = null;
let secretKeyPromise: Promise<Buffer> | null = null;

const getSecretKey = async (): Promise<Buffer> => {
  if (SECRET_KEY) {
    return SECRET_KEY;
  }

  if (!secretKeyPromise) {
    secretKeyPromise = dbConfig
      .secretManagerConnection()
      .then((data: ISecretManagerData) => {
        const key =
          data?.encryptionKey ||
          process.env.ENCRYPTION_KEY ||
          process.env.MESSAGE_SECRET;

        if (!key) {
          throw new Error(
            "Missing encryptionKey in AWS Secrets Manager and environment variables"
          );
        }

        SECRET_KEY = crypto.createHash("sha256").update(key).digest();
        return SECRET_KEY;
      })
      .catch((error) => {
        secretKeyPromise = null;
        throw error;
      });
  }

  return secretKeyPromise;
};

/* =========================
   🔐 Encrypt / Decrypt
========================= */

export const encrypt = async (text?: string): Promise<string | undefined> => {
  if (!text) return text;

  const key = await getSecretKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  return iv.toString("hex") + ":" + encrypted;
};

export const decrypt = async (text?: string): Promise<string | undefined> => {
  if (!text) return text;

  try {
    const [ivHex, encrypted] = text.split(":");
    const key = await getSecretKey();

    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch {
    return text;
  }
};

/* =========================
   🧠 Apply Encryption Plugin
========================= */

export const applyEncryption = (schema: any, fields: string[]) => {
  /* 🔐 Encrypt on save */
  schema.pre("save", async function () {
    await Promise.all(
      fields.map(async (f) => {
        if (this.isModified(f)) {
          this[f] = await encrypt(this[f]);
        }
      })
    );
  });

  /* 🔐 Encrypt on update queries */
  const encryptUpdate = async function () {
    const update = this.getUpdate();
    if (!update) return;

    await Promise.all(
      fields.map(async (f) => {
        if (update[f] != null) {
          update[f] = await encrypt(update[f]);
        }
        if (update.$set && update.$set[f] != null) {
          update.$set[f] = await encrypt(update.$set[f]);
        }
      })
    );
  };

  schema.pre("findOneAndUpdate", encryptUpdate);
  schema.pre("updateOne", encryptUpdate);
  schema.pre("updateMany", encryptUpdate);

  /* 🔓 Decrypt after read */
  const decryptDoc = async (doc: any) => {
    if (!doc) return;

    await Promise.all(
      fields.map(async (f) => {
        doc[f] = await decrypt(doc[f]);
      })
    );
  };

  schema.post("find", async function (docs: any[]) {
    await Promise.all(docs.map(decryptDoc));
  });

  schema.post("findOne", async function (doc: any) {
    await decryptDoc(doc);
  });
  schema.post("findOneAndUpdate", async function (doc: any) {
    await decryptDoc(doc);
  });
  schema.post("findOneAndDelete", async function (doc: any) {
    await decryptDoc(doc);
  });
};