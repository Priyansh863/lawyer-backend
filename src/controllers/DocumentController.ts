import { Request, Response } from "express";
import { uploadImg } from "../utils/fileUpload";
import UserDocument from "../models/user_documents";
import AIService from "../services/AIService";
import { isPDFFile } from "../utils/pdfUtils";

export default class DocumentController {
  /**
   * Uploads a document to S3 and returns the file URL
   * Automatically triggers AI processing for PDF files in background
   * @param req.body.file (base64 string)
   * @param req.body.fileName (string)
   * @param req.body.userId (string)
   */
  static async uploadDocument(req: Request, res: Response) {
    // Save document record after upload
    try {
      const { userId, fileUrl, fileName } = req.body;
      
      // Save to MongoDB
      const doc = await UserDocument.create({
        document_name: fileName,
        status: "Pending",
        uploaded_by: userId,
        link: fileUrl,
      });

      // Automatically trigger AI processing for PDF files in background
      if (isPDFFile(fileName)) {
        console.log(`Auto-triggering AI processing for PDF: ${doc._id}`);
        
        // Process asynchronously in background (don't wait for completion)
        AIService.processDocument(doc._id.toString())
          .then(result => {
            if (result.success) {
              console.log(`AI processing completed for ${doc._id}: Summary generated`);
            } else {
              console.log(`AI processing failed for ${doc._id}: ${result.message}`);
            }
          })
          .catch(error => {
            console.error(`AI processing error for ${doc._id}:`, error.message);
          });
        
        return res.status(200).json({ 
          success: true, 
          fileUrl, 
          document: doc,
          message: "Document uploaded successfully. AI processing started in background."
        });
      }

      // For non-PDF files, just return success
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

  /**
   * Upload document with optional AI processing
   * @param req.body.file (base64 string)
   * @param req.body.fileName (string)
   * @param req.body.userId (string)
   * @param req.body.processWithAI (boolean, optional)
   */
  static async uploadDocumentWithAI(req: Request, res: Response) {
    try {
      const { userId, fileUrl, fileName, processWithAI = false } = req.body;
      
      // Save to MongoDB
      const doc = await UserDocument.create({
        document_name: fileName,
        status: "Pending",
        uploaded_by: userId,
        link: fileUrl,
      });

      // If AI processing is requested and file is PDF
      if (processWithAI && isPDFFile(fileName)) {
        console.log(`Triggering AI processing for document: ${doc._id}`);
        
        // Process asynchronously (don't wait for completion)
        AIService.processDocument(doc._id.toString())
          .then(result => {
            console.log(`AI processing completed for ${doc._id}:`, result.message);
          })
          .catch(error => {
            console.error(`AI processing failed for ${doc._id}:`, error.message);
          });
        
        return res.status(200).json({ 
          success: true, 
          fileUrl, 
          document: doc,
          message: "Document uploaded and AI processing started"
        });
      } else if (processWithAI && !isPDFFile(fileName)) {
        return res.status(400).json({
          success: false,
          message: "AI processing is only available for PDF files"
        });
      }

      return res.status(200).json({ success: true, fileUrl, document: doc });
    } catch (error: any) {
      console.error("Document upload with AI error:", error);
      return res.status(500).json({ success: false, message: error.message || "Failed to upload document" });
    }
  }

  /**
   * Upload document and wait for AI processing to complete, return summary in response
   * @param req.body.file (base64 string)
   * @param req.body.fileName (string)
   * @param req.body.userId (string)
   */
  static async uploadDocumentWithSummary(req: Request, res: Response) {
    try {
      const { userId, fileUrl, fileName } = req.body;
      
      // Validate required fields
      if (!userId || !fileUrl || !fileName) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: userId, fileUrl, fileName"
        });
      }

      // Check if file is PDF
      if (!isPDFFile(fileName)) {
        return res.status(400).json({
          success: false,
          message: "Only PDF files are supported for AI processing"
        });
      }
      
      // Save to MongoDB
      const doc = await UserDocument.create({
        document_name: fileName,
        status: "Pending",
        uploaded_by: userId,
        link: fileUrl,
      });

      console.log(`Processing PDF document synchronously: ${doc._id}`);
      
      // Process document synchronously (wait for completion)
      const aiResult = await AIService.processDocument(doc._id.toString());
      
      if (aiResult.success) {
        // Fetch updated document with summary
        const updatedDoc = await UserDocument.findById(doc._id);
        
        return res.status(200).json({
          success: true,
          message: "Document uploaded and processed successfully",
          document: updatedDoc,
          summary: aiResult.summary,
          fileUrl
        });
      } else {
        // AI processing failed, but document is still saved
        return res.status(200).json({
          success: false,
          message: `Document uploaded but AI processing failed: ${aiResult.message}`,
          document: doc,
          fileUrl
        });
      }
    } catch (error: any) {
      console.error("Document upload with summary error:", error);
      return res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to upload document and generate summary" 
      });
    }
  }

  /**
   * Get documents for a specific client
   */
  static async getClientDocuments(req: Request, res: Response) {
    try {
      const { clientId } = req.params;
      const { status } = req.query;

      const query: any = { uploaded_by: clientId };
      
      if (status && status !== 'all') {
        query.status = status;
      }
      
      const documents = await UserDocument.find(query)
        .populate('uploaded_by', 'first_name last_name email')
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        data: documents
      });
    } catch (error: any) {
      console.error('Error fetching client documents:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch client documents'
      });
    }
  }

  /**
   * Get document by ID
   */
  static async getDocumentById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const document = await UserDocument.findById(id)
        .populate('uploaded_by', 'first_name last_name email');

      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      res.json({
        success: true,
        data: document
      });
    } catch (error: any) {
      console.error('Error fetching document:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch document'
      });
    }
  }

  /**
   * Update document status
   */
  static async updateDocumentStatus(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Must be Pending, Approved, or Rejected'
        });
      }

      const document = await UserDocument.findByIdAndUpdate(
        id,
        { status },
        { new: true, runValidators: true }
      ).populate('uploaded_by', 'first_name last_name email');

      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      res.json({
        success: true,
        message: 'Document status updated successfully',
        data: document
      });
    } catch (error: any) {
      console.error('Error updating document status:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update document status'
      });
    }
  }

  /**
   * Delete document
   */
  static async deleteDocument(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const document = await UserDocument.findByIdAndDelete(id);

      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      res.json({
        success: true,
        message: 'Document deleted successfully'
      });
    } catch (error: any) {
      console.error('Error deleting document:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to delete document'
      });
    }
  }
}
