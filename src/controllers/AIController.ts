import { Request, Response } from "express";
import AIService from "../services/AIService";

export default class AIController {
  /**
   * Process a single document for AI summarization
   */
  static async processDocument(req: Request, res: Response) {
    try {
      const { documentId } = req.body;
      
      if (!documentId) {
        return res.status(400).json({ 
          success: false, 
          message: "Document ID is required" 
        });
      }

      console.log(`Processing document: ${documentId}`);
      const result = await AIService.processDocument(documentId);

      if (result.success) {
        res.status(200).json({
          success: true,
          message: result.message,
          data: { summary: result.summary }
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message
        });
      }
    } catch (error) {
      console.error("AIController processDocument error:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to process document", 
        error: error.message 
      });
    }
  }

  /**
   * Process multiple documents in batch
   */
  static async processBatchDocuments(req: Request, res: Response) {
    try {
      const { documentIds } = req.body;
      
      if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: "Document IDs array is required" 
        });
      }

      console.log(`Processing ${documentIds.length} documents in batch`);
      const results = await AIService.processBatchDocuments(documentIds);

      res.status(200).json({
        success: true,
        message: "Batch processing completed",
        data: { results }
      });
    } catch (error) {
      console.error("AIController processBatchDocuments error:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to process documents in batch", 
        error: error.message 
      });
    }
  }

  /**
   * Get processing status of a document
   */
  static async getDocumentStatus(req: Request, res: Response) {
    try {
      const { documentId } = req.params;
      
      if (!documentId) {
        return res.status(400).json({ 
          success: false, 
          message: "Document ID is required" 
        });
      }

      // This would typically check a processing queue or status
      // For now, we'll just return the current document status
      const UserDocument = (await import("../models/user_documents")).default;
      const document = await UserDocument.findById(documentId);
      
      if (!document) {
        return res.status(404).json({
          success: false,
          message: "Document not found"
        });
      }

      res.status(200).json({
        success: true,
        data: {
          documentId: document._id,
          status: document.status,
          summary: document.summary,
          document_name: document.document_name
        }
      });
    } catch (error) {
      console.error("AIController getDocumentStatus error:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to get document status", 
        error: error.message 
      });
    }
  }

  /**
   * Generate marketing post content using OpenAI
   */
  static async generatePost(req: Request, res: Response) {
    try {
      const { prompt } = req.body;
      
      if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: "Prompt is required and must be a non-empty string" 
        });
      }

      console.log(`Generating post for prompt: ${prompt}`);
      const result = await AIService.generateMarketingPost(prompt);

      if (result.success) {
        res.status(200).json({
          success: true,
          message: "Post generated successfully",
          content: result.content
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message || "Failed to generate post"
        });
      }
    } catch (error) {
      console.error("AIController generatePost error:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to generate post content", 
        error: error.message 
      });
    }
  }
}
