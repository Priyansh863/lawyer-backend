import { Request, Response } from "express";
import { uploadImg } from "../utils/fileUpload";

import UserDocument from "../models/user_documents";

export default class DocumentController {
  /**
   * Uploads a document to S3 and returns the file URL
   * @param req.body.file (base64 string)
   * @param req.body.fileName (string)
   * @param req.body.userId (string)
   */
  static async uploadDocument(req: Request, res: Response) {
    // Save document record after upload
    try {
      const { file, fileName, userId, summary } = req.body;
      if (!file || !fileName || !userId || !summary) {
        return res.status(400).json({ success: false, message: "Missing file, fileName, or userId" });
      }
      const fileUrl = await uploadImg(file, fileName, userId);
      // Save to MongoDB
      const doc = await UserDocument.create({
        document_name: fileName,
        summary,
        status: "Pending",
        uploaded_by: userId,
        link: fileUrl,
      });
      return res.status(200).json({ success: true, fileUrl, document: doc });
    } catch (error: any) {
      console.error("Document upload error:", error);
      return res.status(500).json({ success: false, message: error.message || "Failed to upload document" });
    }
  }

  /**
   * Lists all documents from the database
   */
  static async listDocuments(req: Request, res: Response) {
    try {
      const documents = await UserDocument.find();
      return res.status(200).json({ success: true, documents });
    } catch (error: any) {
      console.error("List documents error:", error);
      return res.status(500).json({ success: false, message: error.message || "Failed to list documents" });
    }
  }
}
