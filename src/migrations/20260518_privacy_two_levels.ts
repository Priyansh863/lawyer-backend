import mongoose from "mongoose";
import { DocumentPrivacy, DocumentPrivacyLevel } from "../models/user_documents";

/**
 * One-time: fully_private → private; legacy privacy_level FULLY_PRIVATE → PRIVATE_SHARED
 */
export async function up() {
  const db = mongoose.connection.db;
  if (!db) throw new Error("Database not connected");

  const collection = db.collection("userdocuments");

  const privacyResult = await collection.updateMany(
    { privacy: "fully_private" },
    { $set: { privacy: DocumentPrivacy.PRIVATE } }
  );

  const levelResult = await collection.updateMany(
    { privacy_level: "FULLY_PRIVATE" },
    { $set: { privacy_level: DocumentPrivacyLevel.PRIVATE_SHARED } }
  );

  console.log(
    `Privacy migration: ${privacyResult.modifiedCount} privacy fields, ${levelResult.modifiedCount} privacy_level fields updated`
  );
}

export async function down() {
  console.log("Rollback not implemented for privacy two-level migration");
}

if (require.main === module) {
  require("dotenv").config();
  const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/lawyer_app";

  mongoose
    .connect(MONGODB_URI)
    .then(() => up())
    .then(() => {
      console.log("Migration completed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migration failed:", error);
      process.exit(1);
    });
}
