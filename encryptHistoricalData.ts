import mongoose from "mongoose";
import dotenv from "dotenv";

import { encrypt } from "./src/utils/mongooseEncryption";

import Message from "./src/models/Message";
import SecureLinkUpload from "./src/models/SecureLinkUpload";
import UserDocument from "./src/models/user_documents";

dotenv.config();

const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://infoservifytech_db_user:ibVSbg4mW1PvZGGu@cluster0.apgiso.mongodb.net/lawyer-dev?retryWrites=true&w=majority";

/**
 * Check whether already encrypted
 */
const isEncrypted = (value?: string) => {
  if (!value || typeof value !== "string") return false;

  const parts = value.split(":");

  return (
    parts.length === 2 &&
    /^[a-f0-9]+$/i.test(parts[0]) &&
    /^[a-f0-9]+$/i.test(parts[1])
  );
};

const encryptField = async (
  Model: any,
  field: string,
  modelName: string
) => {
  console.log(`\n🔄 Encrypting ${modelName}.${field}`);

  const docs = await Model.find({
    [field]: { $exists: true, $ne: null },
  }).lean();

  console.log(`📦 Found ${docs.length} documents`);

  let updated = 0;
  let skipped = 0;

  for (const doc of docs) {
    const value = doc[field];

    // Skip empty/already encrypted
    if (!value || isEncrypted(value)) {
      skipped++;
      continue;
    }

    try {
      console.log(
        `\n🔐 Encrypting ${modelName} | ID: ${doc._id}`
      );

      console.log(
        `📝 Field: ${field}`
      );

      console.log(
        `📄 Original: ${
          typeof value === "string"
            ? value.substring(0, 80)
            : "[NON STRING]"
        }`
      );

      const encryptedValue = await encrypt(value);

      // IMPORTANT:
      // Use native collection update
      // to bypass mongoose middleware
      await Model.collection.updateOne(
        { _id: doc._id },
        {
          $set: {
            [field]: encryptedValue,
          },
        }
      );

      console.log("✅ Encrypted Successfully");

      updated++;
    } catch (err) {
      console.error(
        `❌ Failed ${modelName} ${doc._id}`,
        err
      );
    }
  }

  console.log(`\n🎉 Completed ${modelName}.${field}`);
  console.log(`✅ Updated: ${updated}`);
  console.log(`⏭️ Skipped: ${skipped}`);
};

const run = async () => {
  try {
    console.log("🚀 Connecting MongoDB...");

    await mongoose.connect(MONGO_URI);

    console.log("✅ MongoDB connected");

    // MESSAGE
    await encryptField(
      Message,
      "content",
      "Message"
    );

    // SECURE LINK
    await encryptField(
      SecureLinkUpload,
      "file_url",
      "SecureLinkUpload"
    );

    // USER DOCUMENT
    await encryptField(
      UserDocument,
      "summary",
      "UserDocument"
    );

    await encryptField(
      UserDocument,
      "link",
      "UserDocument"
    );

    await encryptField(
      UserDocument,
      "file_base64",
      "UserDocument"
    );

    console.log("\n🎯 Historical encryption completed");

    process.exit(0);
  } catch (error) {
    console.error("❌ Migration failed", error);
    process.exit(1);
  }
};

run();