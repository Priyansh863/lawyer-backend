import { Request, Response } from "express";
import { uploadImg } from "../utils/fileUpload";
import UserDocument, { DocumentPrivacy, DocumentStatus, DocumentType } from "../models/user_documents";
import AIService from "../services/AIService";
import { isPDFFile } from "../utils/pdfUtils";
import path from "path";
import { User } from "../models/user";
import Case from "../models/case";
import mongoose from "mongoose";

export default class EnhancedDocumentController {
  /**
   * Enhanced document upload with case association, privacy controls, and sharing
   */
  static async uploadDocumentWithCaseAssociation(req: Request, res: Response) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const { 
        userId, 
        fileUrl, 
        fileName, 
        privacy = DocumentPrivacy.PRIVATE,
        selectedUsers = [],
        processWithAI = false,
        fileSize,
        fileType,
        isSecureLink = false,
        documentType = DocumentType.GENERAL,
        caseId,
        description = ''
      } = req.body;

      // Validate required fields
      if (!userId || !fileUrl || !fileName) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: userId, fileUrl, fileName"
        });
      }

      // Validate case association if document is case-related
      if (documentType === DocumentType.CASE_RELATED && !caseId) {
        return res.status(400).json({ 
          success: false, 
          message: "Case ID is required for case-related documents" 
        });
      }

      // Get user to check role
      const user = await User.findById(userId).session(session);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      // Verify case exists and user has access to it
      if (caseId) {
        const caseExists = await Case.findOne({
          _id: caseId,
          $or: [
            { client_id: userId },
            { lawyer_id: userId }
          ]
        }).session(session);

        if (!caseExists) {
          return res.status(404).json({ 
            success: false, 
            message: "Case not found or access denied" 
          });
        }
      }
      
      // Validation for privacy options
      if (privacy === DocumentPrivacy.PRIVATE && selectedUsers.length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: "Private documents must have at least one selected user" 
        });
      }
      
      // Prepare shared_with array based on privacy setting
      let sharedWith = [];
      if (privacy === DocumentPrivacy.PRIVATE) {
        sharedWith = selectedUsers;
      }
      
      // Save to MongoDB within transaction
      const doc = await UserDocument.create([{
        document_name: fileName,
        status: DocumentStatus.PENDING,
        uploaded_by: userId,
        link: fileUrl,
        privacy,
        file_size: fileSize,
        file_type: fileType,
        document_type: documentType,
        case_id: caseId,
        description,
        shared_with: sharedWith,
        is_secure_link: isSecureLink || false
      }], { session });

      const savedDoc = doc[0];

      // If document is case-related, update the case's documents array
      if (documentType === DocumentType.CASE_RELATED && caseId) {
        await Case.findByIdAndUpdate(
          caseId,
          { $push: { documents: savedDoc._id } },
          { session, new: true }
        );
      }

      // Commit transaction if everything is successful
      await session.commitTransaction();
      session.endSession();

      // If AI processing is requested and file is PDF
      if (processWithAI && isPDFFile(fileName)) {
        console.log(`Triggering AI processing for document: ${savedDoc._id}`);
        
        // Process asynchronously (don't wait for completion)
        AIService.processDocument(savedDoc._id.toString())
          .then(result => {
            console.log(`AI processing completed for ${savedDoc._id}:`, result.message);
          })
          .catch(error => {
            console.error(`AI processing failed for ${savedDoc._id}:`, error.message);
          });
      } else if (processWithAI && !isPDFFile(fileName)) {
        console.warn(`AI processing requested for non-PDF file: ${fileName}`);
      }

      return res.status(200).json({ 
        success: true, 
        fileUrl, 
        document: savedDoc,
        message: "Document uploaded successfully" + (processWithAI && isPDFFile(fileName) ? 
                 ". AI processing started in background." : "") 
      });

    } catch (error: any) {
      await session.abortTransaction();
      session.endSession();
      console.error("Document upload with AI error:", error);
      return res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to upload document",
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  /**
   * Get document by ID with access control
   */
  static async getDocumentById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?._id;
      const userRole = req.user?.role;

      if (!userId) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }

      // Find document with access control
      const document = await UserDocument.findById(id)
        .populate('uploaded_by', 'name email account_type')
        .populate({
          path: 'case_id',
          select: 'case_number title description status client_id lawyer_id',
          populate: [
            { path: 'client_id', select: 'name email' },
            { path: 'lawyer_id', select: 'name email' }
          ]
        })
        .populate('shared_with', 'name email account_type');
      
      if (!document) {
        return res.status(404).json({ 
          success: false, 
          message: "Document not found" 
        });
      }

      // Check access permissions
      const hasAccess = 
        // Document is owned by user
        document.uploaded_by._id.toString() === userId.toString() ||
        // Document is shared with user
        document.shared_with.some((user: any) => user._id.toString() === userId.toString()) ||
        // Document is in a case where user is client or lawyer
        (document.case_id && (
          document.case_id.client_id.toString() === userId.toString() ||
          document.case_id.lawyer_id.toString() === userId.toString()
        ));

      if (!hasAccess) {
        return res.status(403).json({ 
          success: false, 
          message: "Access to this document is restricted" 
        });
      }
      
      return res.status(200).json({ 
        success: true, 
        document,
        permissions: {
          can_edit: document.uploaded_by._id.toString() === userId.toString(),
          can_share: document.uploaded_by._id.toString() === userId.toString() && 
                    document.privacy !== DocumentPrivacy.FULLY_PRIVATE,
          can_download: true
        }
      });
    } catch (error: any) {
      console.error("Get document by ID error:", error);
      return res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to get document" 
      });
    }
  }

  /**
   * Get documents accessible by the current user with advanced filtering
   */
  static async getAccessibleDocuments(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      const userRole = req.user?.role;
      
      const { 
        page = 1, 
        limit = 10, 
        status, 
        privacy, 
        documentType,
        caseId,
        search,
        sortBy = 'created_at',
        sortOrder = 'desc'
      } = req.query;
      
      if (!userId) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }
      
      const skip = (Number(page) - 1) * Number(limit);
      const sort: any = { [sortBy as string]: sortOrder === 'asc' ? 1 : -1 };
      
      // Build the base query
      let query: any = {
        $or: [
          // User's own documents
          { uploaded_by: userId },
          // Documents shared with user
          { shared_with: userId }
        ]
      };
      
      // For lawyers, include documents from their cases
      if (userRole === 'lawyer') {
        const lawyerCases = await Case.find({ lawyer_id: userId }).select('_id');
        const caseIds = lawyerCases.map(c => c._id);
        
        if (caseIds.length > 0) {
          query.$or.push({
            case_id: { $in: caseIds }
          });
        }
      }

      // For clients, include documents from their cases
      if (userRole === 'client') {
        const clientCases = await Case.find({ client_id: userId }).select('_id');
        const caseIds = clientCases.map(c => c._id);
        
        if (caseIds.length > 0) {
          query.$or.push({
            case_id: { $in: caseIds }
          });
        }
      }
      
      // Apply filters
      if (status) {
        query.status = status;
      }
      
      if (privacy) {
        query.privacy = privacy;
      }
      
      if (documentType) {
        query.document_type = documentType;
      }
      
      if (caseId) {
        query.case_id = caseId;
      }
      
      if (search) {
        query.$or = query.$or || [];
        query.$or.push(
          { document_name: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        );
      }
      
      // Execute query with pagination
      const [documents, total] = await Promise.all([
        UserDocument.find(query)
          .sort(sort)
          .skip(skip)
          .limit(Number(limit))
          .populate('uploaded_by', 'name email account_type')
          .populate({
            path: 'case_id',
            select: 'case_number title status',
            populate: [
              { path: 'client_id', select: 'name' },
              { path: 'lawyer_id', select: 'name' }
            ]
          })
          .populate('shared_with', 'name email account_type')
          .lean(),
        UserDocument.countDocuments(query)
      ]);
      
      // Add permissions to each document
      const documentsWithPermissions = documents.map(doc => ({
        ...doc,
        permissions: {
          can_edit: doc.uploaded_by._id.toString() === userId.toString(),
          can_share: doc.uploaded_by._id.toString() === userId.toString() && 
                    doc.privacy !== DocumentPrivacy.FULLY_PRIVATE,
          can_download: true
        }
      }));
      
      return res.status(200).json({
        success: true,
        documents: documentsWithPermissions,
        pagination: {
          total,
          page: Number(page),
          pages: Math.ceil(total / Number(limit)),
          limit: Number(limit)
        }
      });
      
    } catch (error: any) {
      console.error("Get accessible documents error:", error);
      return res.status(500).json({ 
        success: false, 
        message: error.message || "Failed to get documents",
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  /**
   * Get documents associated with a specific case
   */
  static async getCaseDocuments(req: Request, res: Response) {
    try {
      const { caseId } = req.params;
      const userId = req.user?._id;
      const { page = 1, limit = 10, documentType, privacy } = req.query;

      if (!userId) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }

      // Verify user has access to the case
      const caseDoc = await Case.findOne({
        _id: caseId,
        $or: [
          { client_id: userId },
          { lawyer_id: userId }
        ]
      });

      if (!caseDoc) {
        return res.status(404).json({
          success: false,
          message: "Case not found or access denied"
        });
      }

      const skip = (Number(page) - 1) * Number(limit);
      
      let query: any = { case_id: caseId };
      
      if (documentType) {
        query.document_type = documentType;
      }
      
      if (privacy) {
        query.privacy = privacy;
      }

      const [documents, total] = await Promise.all([
        UserDocument.find(query)
          .sort({ created_at: -1 })
          .skip(skip)
          .limit(Number(limit))
          .populate('uploaded_by', 'name email account_type')
          .populate('shared_with', 'name email account_type'),
        UserDocument.countDocuments(query)
      ]);

      return res.status(200).json({
        success: true,
        case: caseDoc,
        documents,
        pagination: {
          total,
          page: Number(page),
          pages: Math.ceil(total / Number(limit)),
          limit: Number(limit)
        }
      });

    } catch (error: any) {
      console.error("Get case documents error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to get case documents"
      });
    }
  }

  /**
   * Share a document with specific users
   */
  static async shareDocument(req: Request, res: Response) {
    try {
      const { documentId } = req.params;
      const { userIds, message } = req.body;
      const userId = req.user?._id;

      if (!userId) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }

      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: "User IDs array is required"
        });
      }

      // Find document and verify ownership
      const document = await UserDocument.findOne({
        _id: documentId,
        uploaded_by: userId
      });

      if (!document) {
        return res.status(404).json({
          success: false,
          message: "Document not found or you don't have permission to share it"
        });
      }

      if (document.privacy === DocumentPrivacy.FULLY_PRIVATE) {
        return res.status(403).json({
          success: false,
          message: "Fully private documents cannot be shared"
        });
      }

      // Add new users to shared_with array (avoid duplicates)
      const currentSharedUsers = document.shared_with.map(id => id.toString());
      const newUsers = userIds.filter(id => !currentSharedUsers.includes(id));
      
      if (newUsers.length === 0) {
        return res.status(400).json({
          success: false,
          message: "All specified users already have access to this document"
        });
      }

      document.shared_with.push(...newUsers);
      await document.save();

      const updatedDocument = await UserDocument.findById(documentId)
        .populate('uploaded_by', 'name email')
        .populate('shared_with', 'name email account_type');

      return res.status(200).json({
        success: true,
        message: "Document shared successfully",
        document: updatedDocument
      });

    } catch (error: any) {
      console.error("Share document error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to share document"
      });
    }
  }

  /**
   * Update document privacy settings
   */
  static async updateDocumentPrivacy(req: Request, res: Response) {
    try {
      const { documentId } = req.params;
      const { privacy, selectedUsers = [] } = req.body;
      const userId = req.user?._id;

      if (!userId) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }

      if (!Object.values(DocumentPrivacy).includes(privacy)) {
        return res.status(400).json({
          success: false,
          message: "Invalid privacy setting"
        });
      }

      // Find document and verify ownership
      const document = await UserDocument.findOne({
        _id: documentId,
        uploaded_by: userId
      });

      if (!document) {
        return res.status(404).json({
          success: false,
          message: "Document not found or you don't have permission to modify it"
        });
      }

      // Validate privacy requirements
      if (privacy === DocumentPrivacy.PRIVATE && selectedUsers.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Private documents must have at least one selected user"
        });
      }

      // Update privacy and shared users
      document.privacy = privacy;
      
      if (privacy === DocumentPrivacy.PRIVATE) {
        document.shared_with = selectedUsers;
      } else if (privacy === DocumentPrivacy.PUBLIC) {
        document.shared_with = [];
      } else if (privacy === DocumentPrivacy.FULLY_PRIVATE) {
        document.shared_with = [];
      }

      await document.save();

      const updatedDocument = await UserDocument.findById(documentId)
        .populate('uploaded_by', 'name email')
        .populate('shared_with', 'name email account_type');

      return res.status(200).json({
        success: true,
        message: "Document privacy updated successfully",
        document: updatedDocument
      });

    } catch (error: any) {
      console.error("Update document privacy error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to update document privacy"
      });
    }
  }

  /**
   * Get users available for document sharing
   */
  static async getUsersForSharing(req: Request, res: Response) {
    try {
      const userId = req.user?._id;
      const userRole = req.user?.role;
      const { search, role } = req.query;

      if (!userId) {
        return res.status(401).json({ success: false, message: "Authentication required" });
      }

      let query: any = { 
        _id: { $ne: userId }, // Exclude current user
        account_type: { $in: ['lawyer', 'client'] }
      };

      if (role) {
        query.account_type = role;
      }

      if (search) {
        query.$or = [
          { first_name: { $regex: search, $options: 'i' } },
          { last_name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ];
      }

      const users = await User.find(query)
        .select('first_name last_name email account_type')
        .limit(50)
        .sort({ first_name: 1 });

      return res.status(200).json({
        success: true,
        users
      });

    } catch (error: any) {
      console.error("Get users for sharing error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to get users for sharing"
      });
    }
  }
}
