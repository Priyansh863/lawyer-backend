import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import {
  setEncryptionKey,
  encryptField,
  decryptField,
  applyFieldEncryption
} from "../utils/mongooseEncryption";

test("GCM round trip", () => {
  setEncryptionKey("test-encryption-key-for-gcm-round-trip-12345");
  const originalText = "Hello GCM encryption world!";
  const encrypted = encryptField(originalText);
  assert.ok(encrypted);
  assert.ok(encrypted.startsWith("enc:v1:"));
  
  const decrypted = decryptField(encrypted);
  assert.equal(decrypted, originalText);
});

test("legacy CBC decryption compatibility", () => {
  const encryptionKey = "test-encryption-key-for-cbc-compatibility-12345";
  setEncryptionKey(encryptionKey);

  const keyBuffer = crypto.createHash("sha256").update(encryptionKey).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", keyBuffer, iv);
  
  const originalText = "Legacy CBC plaintext content";
  let encryptedHex = cipher.update(originalText, "utf8", "hex");
  encryptedHex += cipher.final("hex");
  
  const legacyCiphertext = iv.toString("hex") + ":" + encryptedHex;

  const decrypted = decryptField(legacyCiphertext);
  assert.equal(decrypted, originalText);
});

test("missing-key case fails closed", () => {
  setEncryptionKey(""); // Unset the encryption key
  
  assert.throws(() => {
    encryptField("some sensitive text");
  }, /Encryption key not initialized/);
});

test("update-query encryption hooks work", () => {
  setEncryptionKey("test-encryption-key-for-update-query-12345");
  
  const preHooks: Record<string, Function[]> = {};
  const mockSchema: any = {
    pre(event: string, handler: Function) {
      if (!preHooks[event]) preHooks[event] = [];
      preHooks[event].push(handler);
    },
    post() {}
  };

  applyFieldEncryption(mockSchema, ["secretField"]);

  assert.ok(preHooks["findOneAndUpdate"]);
  assert.ok(preHooks["updateOne"]);
  assert.ok(preHooks["updateMany"]);

  const handler = preHooks["updateOne"][0];

  // Test Direct field updates
  let updateObjDirect = { secretField: "plain-text-direct-update" };
  const mockQueryDirect: any = {
    getUpdate() {
      return updateObjDirect;
    }
  };
  let nextCalled = false;
  handler.call(mockQueryDirect, () => { nextCalled = true; });
  assert.ok(nextCalled);
  const updatedDirect = mockQueryDirect.getUpdate();
  assert.ok(updatedDirect.secretField.startsWith("enc:v1:"));
  assert.equal(decryptField(updatedDirect.secretField), "plain-text-direct-update");

  // Test $set updates
  let updateObjSet = { $set: { secretField: "plain-text-set-update" } };
  const mockQuerySet: any = {
    getUpdate() {
      return updateObjSet;
    }
  };
  nextCalled = false;
  handler.call(mockQuerySet, () => { nextCalled = true; });
  assert.ok(nextCalled);
  const updatedSet = mockQuerySet.getUpdate();
  assert.ok(updatedSet.$set.secretField.startsWith("enc:v1:"));
  assert.equal(decryptField(updatedSet.$set.secretField), "plain-text-set-update");
});
