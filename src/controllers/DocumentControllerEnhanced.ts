import { Request, Response } from "express";
import { uploadImg } from "../utils/fileUpload";
import UserDocument, { DocumentPrivacy, DocumentStatus } from "../models/user_documents";
import AIService from "../services/AIService";
import { isPDFFile } from "../utils/pdfUtils";
import { compressBase64 } from "../utils/documentUtils";
import path from "path";
import { User } from "../models/user";

export default class DocumentControllerEnhanced {
  /**
   * Upload document for a specific client (private by default)
   * @param req.body.client_id (string) - Client ID
   * @param req.body.fileUrl (string) - File URL after S3 upload
   * @param req.body.fileName (string) - File name
   * @param req.body.privacy (string) - Optional: 'private' or 'public' (defaults to private)
   */
  static async uploadClientDocument(req: Request, res: Response) {
    try {
      const { client_id, fileUrl, fileName, privacy = 'private', file_base64 } = req.body;
      const uploaded_by = (req as any).user._id; // From auth middleware
      
      // Validate required fields
      if (!client_id || !fileUrl || !fileName) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: client_id, fileUrl, fileName"
        });
      }
      
      // Validate client exists
      const client = await User.findById(client_id);
      if (!client || client.account_type !== 'client') {
        return res.status(400).json({
          success: false,
          message: "Invalid client ID"
        });
      }
      
      // Get file extension and determine file type
      const fileExtension = path.extname(fileName).toLowerCase();
      let fileTypeDisplay = 'Document';
      if (['.pdf'].includes(fileExtension)) {
        fileTypeDisplay = 'PDF';
      } else if (['.jpg', '.jpeg', '.png', '.gif'].includes(fileExtension)) {
        fileTypeDisplay = 'Image';
      } else if (['.mp4', '.avi', '.mov'].includes(fileExtension)) {
        fileTypeDisplay = 'Video';
      }
      
      // Save to MongoDB with private privacy by default
      const doc = await UserDocument.create({
        document_name: fileName,
        status: DocumentStatus.PENDING,
        uploaded_by: client_id, // Document belongs to client
        link: fileUrl,
        file_base64: file_base64 ? compressBase64(file_base64) : undefined,
        file_type: fileTypeDisplay,
        privacy: privacy === 'public' ? DocumentPrivacy.PUBLIC : DocumentPrivacy.PRIVATE,
        shared_with: [] // Initialize empty shared array
      });
      
      // If it's a PDF, trigger AI processing
      if (isPDFFile(fileName)) {
        try {
          await AIService.processDocument(doc._id.toString());
        } catch (aiError) {
          console.error('AI processing failed:', aiError);
          // Don't fail the upload if AI processing fails
        }
      }
      
      return res.status(201).json({
        success: true,
        message: "Document uploaded successfully",
        data: {
          document_id: doc._id,
          document_name: doc.document_name,
          status: doc.status,
          privacy: doc.privacy,
          file_type: doc.file_type,
          uploaded_by: doc.uploaded_by,
          created_at: doc.created_at
        }
      });
      
    } catch (error: any) {
      console.error('Error uploading client document:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to upload document'
      });
    }
  }

  /**
   * Get documents for a specific client
   * @param req.params.clientId (string) - Client ID
   * @param req.query.privacy (string) - Optional: filter by privacy level
   */
  static async getClientDocuments(req: Request, res: Response) {
    try {
      const { clientId } = req.params;
      const { privacy } = req.query;
      const user_id = (req as any).user._id;
      
      // Build query
      let query: any = { uploaded_by: clientId };
      if (privacy) {
        query.privacy = privacy;
      }
      
      // Get documents accessible by the user
      const documents = await UserDocument.getAccessibleDocuments(user_id, (req as any).user.account_type);
      
      // Filter by client ID
      const clientDocuments = documents.filter((doc: any) => 
        doc.uploaded_by.toString() === clientId
      );
      
      return res.status(200).json({
        success: true,
        data: clientDocuments
      });
      
    } catch (error: any) {
      console.error('Error getting client documents:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get client documents'
      });
    }
  }

  /**
   * Update document privacy
   * @param req.params.documentId (string) - Document ID
   * @param req.body.privacy (string) - 'private' or 'public'
   */
  static async updateDocumentPrivacy(req: Request, res: Response) {
    try {
      const { documentId } = req.params;
      const { privacy } = req.body;
      const user_id = (req as any).user._id;
      
      // Validate privacy value
      if (!privacy || !Object.values(DocumentPrivacy).includes(privacy)) {
        return res.status(400).json({
          success: false,
          message: "Invalid privacy value. Must be 'private' or 'public'"
        });
      }
      
      // Find document and verify ownership
      const document = await UserDocument.findOne({
        _id: documentId,
        uploaded_by: user_id
      });
      
      if (!document) {
        return res.status(404).json({
          success: false,
          message: "Document not found or you don't have permission to modify it"
        });
      }
      
      // Update privacy
      document.privacy = privacy;
      await document.save();
      
      return res.status(200).json({
        success: true,
        message: "Document privacy updated successfully",
        data: {
          document_id: document._id,
          privacy: document.privacy
        }
      });
      
    } catch (error: any) {
      console.error('Error updating document privacy:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to update document privacy'
      });
    }
  }

  /**
   * Enhanced upload supporting PDF, Image, and Video files with AI processing
   * Updated to default to PRIVATE privacy
   */
  static async uploadDocumentEnhanced(req: Request, res: Response) {
    try {
      const { userId, fileUrl, fileName, fileType, privacy = 'private', file_base64 } = req.body;
      
      // Validate required fields
      if (!userId || !fileUrl || !fileName) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: userId, fileUrl, fileName"
        });
      }
      
      // Get file extension and determine file type
      const fileExtension = path.extname(fileName).toLowerCase();
      
      // Determine file type display name
      let fileTypeDisplay = 'Document';
      if (['.pdf'].includes(fileExtension)) {
        fileTypeDisplay = 'PDF';
      } else if (['.jpg', '.jpeg', '.png', '.gif'].includes(fileExtension)) {
        fileTypeDisplay = 'Image';
      } else if (['.mp4', '.avi', '.mov'].includes(fileExtension)) {
        fileTypeDisplay = 'Video';
      }
      
      // Save to MongoDB with private privacy by default
      const doc = await UserDocument.create({
        document_name: fileName,
        status: DocumentStatus.PENDING,
        uploaded_by: userId,
        link: fileUrl,
        file_base64: file_base64 ? compressBase64(file_base64) : undefined,
        file_type: fileTypeDisplay,
        privacy: privacy === 'public' ? DocumentPrivacy.PUBLIC : DocumentPrivacy.PRIVATE, // Default to private
        shared_with: [] // Initialize empty shared array
      });
      
      // If it's a PDF, trigger AI processing
      if (isPDFFile(fileName)) {
        try {
          await AIService.processDocument(doc._id.toString());
        } catch (aiError) {
          console.error('AI processing failed:', aiError);
          // Don't fail the upload if AI processing fails
        }
      }
      
      return res.status(201).json({
        success: true,
        message: "Document uploaded successfully",
        data: {
          document_id: doc._id,
          document_name: doc.document_name,
          status: doc.status,
          privacy: doc.privacy,
          file_type: doc.file_type,
          uploaded_by: doc.uploaded_by,
          created_at: doc.created_at
        }
      });
      
    } catch (error: any) {
      console.error('Error uploading document:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to upload document'
      });
    }
  }
}
