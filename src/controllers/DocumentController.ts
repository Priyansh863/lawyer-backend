import { Request, Response } from "express";
import { uploadImg } from "../utils/fileUpload";
import UserDocument, { DocumentPrivacy, DocumentStatus } from "../models/user_documents";
import AIService from "../services/AIService";
import { isPDFFile } from "../utils/pdfUtils";
import path from "path";
import { User } from "../models/user";

export default class DocumentController {
  /**
   * Enhanced upload supporting PDF, Image, and Video files with AI processing
   * @param req.body.file (base64 string)
   * @param req.body.fileName (string)
   * @param req.body.userId (string)
   * @param req.body.fileType (optional: 'pdf' | 'image' | 'video')
   */
  static async uploadDocumentEnhanced(req: Request, res: Response) {
    try {
      const { userId, fileUrl, fileName, fileType } = req.body;
      
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
      
      // Save to MongoDB
      const doc = await UserDocument.create({
        document_name: fileName,
        status: "Pending",
        uploaded_by: userId,
        link: fileUrl,
        file_type: fileTypeDisplay
      });

      console.log(`Processing ${fileTypeDisplay} document: ${doc._id}`);
      
      // Process document with AI service (only for PDFs for now)
      if (fileName) {
        try {
          const aiResult = await AIService.processDocument(doc._id.toString());
          
          if (aiResult.success) {
            // Fetch updated document with summary
            const updatedDoc = await UserDocument.findById(doc._id);
            
            return res.status(200).json({
              success: true,
              message: `${fileTypeDisplay} processed successfully`,
              document: updatedDoc,
              summary: aiResult.summary
            });
          } else {
            return res.status(200).json({
              success: true,
              message: `${fileTypeDisplay} uploaded but AI processing failed`,
              document: doc,
              aiError: aiResult.message
            });
          }
        } catch (aiError: any) {
          console.error('AI processing error:', aiError);
          return res.status(200).json({
            success: true,
            message: `${fileTypeDisplay} uploaded but AI processing failed`,
            document: doc,
            aiError: aiError.message
          });
        }
      } 
    } catch (error: any) {
      console.error("Enhanced upload document error:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to upload and process document",
        error: error.message
      });
    }
  }

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
      const documents = await UserDocument.find().sort({ _id: -1 });
      return res.status(200).json({ success: true, documents });
    } catch (error: any) {
      console.error("List documents error:", error);
      return res.status(500).json({ success: false, message: error.message || "Failed to list documents" });
    }
  }

  /**
   * Upload document with privacy settings and optional AI processing
   * @param req.body.file (base64 string)
   * @param req.body.fileName (string)
   * @param req.body.userId (string)
   * @param req.body.privacy (string, 'public' or 'private')
   * @param req.body.processWithAI (boolean, optional)
   * @param req.body.fileSize (number, optional)
   * @param req.body.fileType (string, optional)
   */
  static async uploadDocumentWithAI(req: Request, res: Response) {
    try {
      const { 
        userId, 
        fileUrl, 
        fileName, 
        privacy = DocumentPrivacy.PUBLIC, 
        processWithAI = false,
        fileSize,
        fileType
      } = req.body;
      
      // Get user to check role
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
      
      // Lawyers can only upload public documents
      if (user.account_type === 'lawyer' && privacy === DocumentPrivacy.PRIVATE) {
        return res.status(403).json({ 
          success: false, 
          message: "Lawyers can only upload public documents" 
        });
      }
      
      // Save to MongoDB
      const doc = await UserDocument.create({
        document_name: fileName,
        status: DocumentStatus.PENDING,
        uploaded_by: userId,
        link: fileUrl,
        privacy,
        file_size: fileSize,
        file_type: fileType,
        shared_with: []
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

  /**
   * Get documents accessible by the current user (own + shared)
   * Supports filtering by privacy, status, and pagination
   */
  static async getAccessibleDocuments(req: Request, res: Response) {
    try {
      const { userId } = req.body;
      const { 
        privacy, 
        status, 
        page = 1, 
        limit = 20, 
        search 
      } = req.query;

      // Get user to determine role
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      // Build query for accessible documents
      const query: any = {
        $or: [
          // User's own documents
          { uploaded_by: userId },
          // Documents shared with this user (if lawyer)
          ...(user.account_type === 'lawyer' ? [{ shared_with: userId }] : [])
        ]
      };

      // Apply filters
      if (privacy) {
        query.privacy = privacy;
      }
      if (status) {
        query.status = status;
      }
      if (search) {
        query.document_name = { $regex: search, $options: 'i' };
      }

      // Calculate pagination
      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
      
      // Get documents with pagination
      const documents = await UserDocument.find(query)
        .populate('uploaded_by', 'first_name last_name email account_type')
        .populate('shared_with', 'first_name last_name email account_type')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit as string));

      // Get total count for pagination
      const total = await UserDocument.countDocuments(query);

      return res.status(200).json({
        success: true,
        documents,
        pagination: {
          current_page: parseInt(page as string),
          per_page: parseInt(limit as string),
          total,
          total_pages: Math.ceil(total / parseInt(limit as string))
        }
      });
    } catch (error: any) {
      console.error('Error getting accessible documents:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get documents'
      });
    }
  }

  /**
   * Share a private document with specific lawyers
   * Only document owner (client) can share their private documents
   */
  static async shareDocument(req: Request, res: Response) {
    try {
      const { documentId } = req.params;
      const { userId, lawyerIds } = req.body;

      // Validate input
      if (!lawyerIds || !Array.isArray(lawyerIds) || lawyerIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Please provide lawyer IDs to share with'
        });
      }

      // Find the document
      const document = await UserDocument.findById(documentId);
      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      // Check if user owns the document
      if (document.uploaded_by.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'You can only share your own documents'
        });
      }

      // Check if document is private (only private documents can be shared)
      if (document.privacy !== DocumentPrivacy.PRIVATE) {
        return res.status(400).json({
          success: false,
          message: 'Only private documents can be shared with lawyers'
        });
      }

      // Verify all provided IDs are lawyers
      const lawyers = await User.find({
        _id: { $in: lawyerIds },
        account_type: 'lawyer'
      });

      if (lawyers.length !== lawyerIds.length) {
        return res.status(400).json({
          success: false,
          message: 'Some provided IDs are not valid lawyers'
        });
      }

      // Share document with lawyers
      const updatedDocument = await UserDocument.findByIdAndUpdate(
        documentId,
        { $addToSet: { shared_with: { $each: lawyerIds } } },
        { new: true }
      ).populate('shared_with', 'first_name last_name email account_type');

      return res.status(200).json({
        success: true,
        message: 'Document shared successfully',
        document: updatedDocument
      });
    } catch (error: any) {
      console.error('Error sharing document:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to share document'
      });
    }
  }

  /**
   * Unshare a document from specific lawyers
   * Only document owner can unshare
   */
  static async unshareDocument(req: Request, res: Response) {
    try {
      const { documentId } = req.params;
      const { userId, lawyerId } = req.body;

      // Find the document
      const document = await UserDocument.findById(documentId);
      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      // Check if user owns the document
      if (document.uploaded_by.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'You can only unshare your own documents'
        });
      }

      // Remove lawyer from shared_with array
      const updatedDocument = await UserDocument.findByIdAndUpdate(
        documentId,
        { $pull: { shared_with: lawyerId } },
        { new: true }
      ).populate('shared_with', 'first_name last_name email account_type');

      return res.status(200).json({
        success: true,
        message: 'Document unshared successfully',
        document: updatedDocument
      });
    } catch (error: any) {
      console.error('Error unsharing document:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to unshare document'
      });
    }
  }

  /**
   * Update document privacy settings
   * Only document owner can change privacy
   * Lawyers cannot set documents to private
   */
  static async updateDocumentPrivacy(req: Request, res: Response) {
    try {
      const { documentId } = req.params;
      const { userId, privacy } = req.body;

      // Validate privacy value
      if (!Object.values(DocumentPrivacy).includes(privacy)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid privacy setting. Must be "public" or "private"'
        });
      }

      // Find the document
      const document = await UserDocument.findById(documentId);
      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      // Check if user owns the document
      if (document.uploaded_by.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'You can only modify your own documents'
        });
      }

      // Get user to check role
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      // Lawyers cannot set documents to private
      if (user.account_type === 'lawyer' && privacy === DocumentPrivacy.PRIVATE) {
        return res.status(403).json({
          success: false,
          message: 'Lawyers cannot create private documents'
        });
      }

      // If changing from private to public, clear shared_with array
      const updateData: any = { privacy };
      if (privacy === DocumentPrivacy.PUBLIC && document.privacy === DocumentPrivacy.PRIVATE) {
        updateData.shared_with = [];
      }

      // Update document privacy
      const updatedDocument = await UserDocument.findByIdAndUpdate(
        documentId,
        updateData,
        { new: true }
      ).populate('uploaded_by', 'first_name last_name email account_type')
       .populate('shared_with', 'first_name last_name email account_type');

      return res.status(200).json({
        success: true,
        message: 'Document privacy updated successfully',
        document: updatedDocument
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
   * Get all lawyers for sharing purposes
   * Only clients can access this endpoint
   */
  static async getLawyersForSharing(req: Request, res: Response) {
    try {
      const { userId } = req.body;

      // Get user to check role
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      // Only clients can share documents with lawyers
      if (user.account_type !== 'client') {
        return res.status(403).json({
          success: false,
          message: 'Only clients can share documents with lawyers'
        });
      }

      // Get all lawyers
      const lawyers = await User.find(
        { account_type: 'lawyer' },
        'first_name last_name email profile_image pratice_area experience'
      ).sort({ first_name: 1 });

      return res.status(200).json({
        success: true,
        lawyers
      });
    } catch (error: any) {
      console.error('Error getting lawyers for sharing:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get lawyers'
      });
    }
  }

  /**
   * Get document sharing details
   * Shows who a document is shared with
   */
  static async getDocumentSharingDetails(req: Request, res: Response) {
    try {
      const { documentId } = req.params;
      const { userId } = req.body;

      // Find the document
      const document = await UserDocument.findById(documentId)
        .populate('uploaded_by', 'first_name last_name email account_type')
        .populate('shared_with', 'first_name last_name email account_type profile_image');

      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      // Check if user has access to this document
      const hasAccess = 
        document.uploaded_by._id.toString() === userId ||
        document.shared_with.some((lawyer: any) => lawyer._id.toString() === userId);

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: 'You do not have access to this document'
        });
      }

      return res.status(200).json({
        success: true,
        document: {
          _id: document._id,
          document_name: document.document_name,
          privacy: document.privacy,
          status: document.status,
          uploaded_by: document.uploaded_by,
          shared_with: document.shared_with,
          is_shared: document.shared_with.length > 0,
          created_at: document.created_at,
          updated_at: document.updated_at
        }
      });
    } catch (error: any) {
      console.error('Error getting document sharing details:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get document details'
      });
    }
  }
}
