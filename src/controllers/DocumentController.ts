import { Request, Response } from "express";
import { uploadImg, ingestS3UploadToStoredBase64, roundTripBase64ViaS3ToStoredBase64 } from "../utils/fileUpload";
import UserDocument, { DocumentPrivacy, DocumentStatus, DocumentType, StorageType } from "../models/user_documents";
import AIService from "../services/AIService";
import { isPDFFile } from "../utils/pdfUtils";
import { compressBase64, decompressBase64 } from "../utils/documentUtils";
import path from "path";
import { User } from "../models/user";
import Case from "../models/case";
import mongoose from "mongoose";
import { NotificationService } from '../services/notificationService';

export default class DocumentController {
  private static logPerf(label: string, startedAtMs: number, extra?: Record<string, any>) {
    const elapsedMs = Date.now() - startedAtMs;
    const base = extra ? ` ${JSON.stringify(extra)}` : "";
    console.log(`[perf] ${label} ${elapsedMs}ms${base}`);
  }
  /**
   * Enhanced upload supporting PDF, Image, and Video files with AI processing
   * @param req.body.file (base64 string)
   * @param req.body.fileName (string)
   * @param req.body.userId (string)
   * @param req.body.fileType (optional: 'pdf' | 'image' | 'video')
   */
  static async uploadDocumentEnhanced(req: Request, res: Response) {
    try {
      const {
        user_id,
        link,
        file_base64,
        document_name,
        file_type,
        privacy,
        process_with_ai,
        file_size,
        case_id,
        associated_user_id,
        storage_type,
        storage_location
      } = req.body;

      console.log(`[API] Received uploadDocumentEnhanced request - Name: ${document_name}, Base64 length: ${file_base64?.length || 0}`);

      // Validate required fields
      if (!user_id || !document_name) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: user_id, document_name"
        });
      }

      // Require at least one source of file content
      if ((!link || link.trim() === '') && (!file_base64 || file_base64.trim() === '')) {
        return res.status(400).json({
          success: false,
          message: "Either link or file_base64 is required"
        });
      }

      // Validate case_id logic: only private documents can have case_id
      if (case_id && privacy !== DocumentPrivacy.PRIVATE) {
        return res.status(400).json({
          success: false,
          message: "Case ID can only be assigned to private documents"
        });
      }

      // Enforced pipeline:
      // base64 -> S3 upload -> GetObject -> base64 -> DB -> DeleteObject
      // If base64 isn't provided, fall back to link ingest (GetObject -> base64 -> DB -> DeleteObject).
      const s3RoundTrip = await roundTripBase64ViaS3ToStoredBase64(file_base64, document_name, user_id);
      const s3Ingest = s3RoundTrip ?? (await ingestS3UploadToStoredBase64(link, file_base64));
      const processedBase64 =
        s3Ingest?.file_base64 ?? (file_base64 ? compressBase64(file_base64) : null);
      const linkForDb = s3Ingest ? undefined : link;

      // Get file extension and determine file type
      const fileExtension = path.extname(document_name).toLowerCase();


      // Determine file type display name
      let fileTypeDisplay = 'Document';
      if (['.pdf'].includes(fileExtension)) {
        fileTypeDisplay = 'PDF';
      } else if (['.jpg', '.jpeg', '.png', '.gif'].includes(fileExtension)) {
        fileTypeDisplay = 'Image';
      } else if (['.mp4', '.avi', '.mov'].includes(fileExtension)) {
        fileTypeDisplay = 'Video';
      }

      // Prepare document data
      const documentData: any = {
        document_name: document_name,
        status: "Completed",
        uploaded_by: user_id,
        link: linkForDb,
        file_base64: processedBase64,
        file_type: file_type || fileTypeDisplay,
        document_type: 'general', // Always general, no user selection
        privacy: privacy || 'public',
        file_size: file_size,
        storage_type: storage_type || 'cloud',
        storage_location: storage_location || null
      };

      // Only add case_id if privacy is private and case_id is provided
      if (privacy === DocumentPrivacy.PRIVATE && case_id) {
        documentData.case_id = case_id;
      }

      // Save to MongoDB
      const doc = await UserDocument.create(documentData);

      if (associated_user_id) {
        const documentData: any = {
          document_name: document_name,
          status: "Pending",
          uploaded_by: associated_user_id,
          link: linkForDb,
          file_base64: processedBase64,
          file_type: file_type || fileTypeDisplay,
          document_type: 'general', // Always general, no user selection
          privacy: privacy || 'public',
          file_size: file_size,
          storage_type: storage_type || 'cloud',
          storage_location: storage_location || null
        };
        await UserDocument.create(documentData);
      }



      console.log(`Processing ${fileTypeDisplay} document: ${doc._id}`);

      // Process document with AI service if requested
      if (process_with_ai && document_name) {
        try {
          const aiResult = await AIService.processDocument(doc._id.toString());

          // Send notification for document upload if public (after AI processing)
          try {
            console.log('privacyprivacyprivacyprivacy', privacy)
            if (privacy === DocumentPrivacy.PUBLIC) {
              console.log('Sending document upload notification for public document');
              await NotificationService.notifyDocumentUploaded(doc, user_id);
            }
          } catch (notificationError) {
            console.error('Failed to send document upload notification:', notificationError);
          }

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
      } else {
        // Send notification for document upload if public
        try {
          if (privacy === DocumentPrivacy.PUBLIC) {
            await NotificationService.notifyDocumentUploaded(doc, user_id);
          }
        } catch (notificationError) {
          console.error('Failed to send document upload notification:', notificationError);
        }

        // Return success for non-AI uploads
        return res.status(200).json({
          success: true,
          message: `${fileTypeDisplay} uploaded successfully`,
          document: doc
        });
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
   * Create a "folder" document entry (no actual file, used for organizing documents)
   * POST /api/v1/document/create-folder
   */
  static async createFolder(req: Request, res: Response) {
    try {
      const {
        document_name,
        user_id,
        file_size,
        file_type,
        storage_type,
        storage_location,
        privacy
      } = req.body;

      // Basic validation
      if (!document_name || !user_id) {
        return res.status(400).json({
          success: false,
          message: "document_name and user_id are required"
        });
      }

      // Create a document record that represents a folder
      const folderDoc = await UserDocument.create({
        document_name,
        uploaded_by: user_id,
        status: DocumentStatus.COMPLETED,           // Folders don't need processing
        link: '#',                                  // No real file link
        file_size: file_size || 0,                  // 0 size to signal folder
        file_type: file_type || 'folder',
        storage_type: storage_type || StorageType.CLOUD,
        storage_location: storage_location || null,
        privacy: privacy || DocumentPrivacy.PRIVATE,
        document_type: DocumentType.GENERAL,
        shared_with: [],
        is_secure_link: false
      });

      return res.status(201).json({
        success: true,
        message: "Folder created successfully",
        document: folderDoc
      });
    } catch (error: any) {
      console.error("Error creating folder:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to create folder"
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
      const { userId, fileUrl, fileName, privacy, file_base64 } = req.body;

      console.log("re.body=======", req.body)

      if (!userId || !fileName) {
        return res.status(400).json({
          success: false,
          message: "userId and fileName are required"
        });
      }

      const s3RoundTrip = await roundTripBase64ViaS3ToStoredBase64(file_base64, fileName, userId);
      const s3Ingest = s3RoundTrip ?? (await ingestS3UploadToStoredBase64(fileUrl, file_base64));
      const storedBase64 = s3Ingest?.file_base64 ?? (file_base64 ? compressBase64(file_base64) : undefined);
      const linkStored = s3Ingest ? undefined : fileUrl;

      // Save to MongoDB
      const doc = await UserDocument.create({
        document_name: fileName,
        status: "Pending",
        uploaded_by: userId,
        link: linkStored,
        file_base64: storedBase64,
        privacy
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
          fileUrl: linkStored ?? fileUrl,
          document: doc,
          message: "Document uploaded successfully. AI processing started in background."
        });
      }

      // Send notification for document upload if public
      try {
        if (privacy === DocumentPrivacy.PUBLIC) {
          await NotificationService.notifyDocumentUploaded(doc, userId);
        }
      } catch (notificationError) {
        console.error('Failed to send document upload notification:', notificationError);
      }

      // For non-PDF files, just return success
      return res.status(200).json({ success: true, fileUrl: linkStored ?? fileUrl, document: doc });
    } catch (error: any) {
      console.error("Document upload error:", error);
      return res.status(500).json({ success: false, message: error.message || "Failed to upload document" });
    }
  }

  /**
   * Lists all documents from the database
   */
  static async listDocuments(req: any, res: Response) {
    const t0 = Date.now();
    try {
      const page = Math.max(parseInt(req.query.page as string) || 1, 1);
      const limitRaw = parseInt(req.query.limit as string) || 20;
      const limit = Math.min(Math.max(limitRaw, 1), 50);
      const skip = (page - 1) * limit;

      // Fetch user's own documents AND all public documents from other users.
      // Important: exclude large `file_base64` field; UI should fetch content via /:id/view or /:id/download.
      const query = {
        $or: [{ uploaded_by: req.id }, { privacy: DocumentPrivacy.PUBLIC }],
      };

      const [documents, total] = await Promise.all([
        UserDocument.find(query)
          .select("-file_base64")
          .sort({ created_at: -1, createdAt: -1, _id: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        UserDocument.countDocuments(query),
      ]);
      DocumentController.logPerf("document.list", t0, { page, limit, returned: documents.length, total });

      return res.status(200).json({
        success: true,
        documents,
        pagination: {
          currentPage: page,
          perPage: limit,
          total,
          totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        },
      });
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
   * @param req.body.privacy (string, 'public', 'private', or 'fully_private')
   * @param req.body.selectedUsers (array, required if privacy is 'private')
   * @param req.body.processWithAI (boolean, optional)
   * @param req.body.fileSize (number, optional)
   * @param req.body.fileType (string, optional)
   * @param req.body.isSecureLink (boolean, optional - for secure link uploads)
   */
  static async uploadDocumentWithAI(req: Request, res: Response) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const {
        userId,
        fileUrl,
        file_base64,
        fileName,
        privacy = DocumentPrivacy.PRIVATE, // Default to private for security
        selectedUsers = [],
        processWithAI = false,
        fileSize,
        fileType,
        isSecureLink = false,
        documentType = DocumentType.GENERAL,
        caseId,
        description = ''
      } = req.body;

      // Validate case association if document is case-related
      if (documentType === DocumentType.CASE_RELATED && !caseId) {
        return res.status(400).json({
          success: false,
          message: "Case ID is required for case-related documents"
        });
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

      // Get user to check role
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      // Validation for privacy options
      if (privacy === DocumentPrivacy.PRIVATE && selectedUsers.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Private documents must have at least one selected user"
        });
      }

      // Both lawyers and clients can upload all document types (removed restriction)

      // Prepare shared_with array based on privacy setting
      let sharedWith = [];
      if (privacy === DocumentPrivacy.PRIVATE) {
        sharedWith = selectedUsers;
      }

      const s3RoundTrip = await roundTripBase64ViaS3ToStoredBase64(file_base64, fileName, userId);
      const s3Ingest = s3RoundTrip ?? (await ingestS3UploadToStoredBase64(fileUrl, file_base64));
      const storedBase64 = s3Ingest?.file_base64 ?? (file_base64 ? compressBase64(file_base64) : undefined);
      const linkStored = s3Ingest ? undefined : fileUrl;

      // Save to MongoDB within transaction
      const doc = await UserDocument.create([{
        document_name: fileName,
        status: DocumentStatus.PENDING,
        uploaded_by: userId,
        link: linkStored,
        file_base64: storedBase64,
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

      // Send notification for document upload if public
      try {
        if (privacy === DocumentPrivacy.PUBLIC) {
          await NotificationService.notifyDocumentUploaded(savedDoc, userId);
        }
      } catch (notificationError) {
        console.error('Failed to send document upload notification:', notificationError);
      }

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
        fileUrl: linkStored ?? fileUrl,
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
   * Upload document and wait for AI processing to complete, return summary in response
   * @param req.body.file (base64 string)
   * @param req.body.fileName (string)
   * @param req.body.userId (string)
   */
  static async uploadDocumentWithSummary(req: Request, res: Response) {
    try {
      const { userId, fileUrl, fileName, file_base64 } = req.body;

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

      const s3RoundTrip = await roundTripBase64ViaS3ToStoredBase64(file_base64, fileName, userId);
      const s3Ingest = s3RoundTrip ?? (await ingestS3UploadToStoredBase64(fileUrl, file_base64));
      const storedBase64 = s3Ingest?.file_base64 ?? (file_base64 ? compressBase64(file_base64) : undefined);
      const linkStored = s3Ingest ? undefined : fileUrl;

      // Save to MongoDB
      const doc = await UserDocument.create({
        document_name: fileName,
        status: "Pending",
        uploaded_by: userId,
        link: linkStored,
        file_base64: storedBase64,
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
          fileUrl: linkStored ?? fileUrl
        });
      } else {
        // AI processing failed, but document is still saved
        return res.status(200).json({
          success: false,
          message: `Document uploaded but AI processing failed: ${aiResult.message}`,
          document: doc,
          fileUrl: linkStored ?? fileUrl
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
  private static normalizeDocumentForUI(
    doc: any,
    opts: { includeFileBase64?: boolean } = {}
  ) {
    const createdAtValue = doc?.createdAt ?? doc?.created_at ?? null;
    const created_atValue = doc?.created_at ?? doc?.createdAt ?? null;

    // Avoid decompressing base64 in list endpoints (slow + large payload).
    const includeFileBase64 = Boolean(opts.includeFileBase64);
    let fileBase64: string | null = includeFileBase64 ? (doc?.file_base64 ?? null) : null;
    if (includeFileBase64 && fileBase64) {
      try {
        fileBase64 = decompressBase64(fileBase64);
      } catch (e) {
        console.error("[normalizeDocumentForUI] decompression failed, returning raw value");
      }
    }

    return {
      // UI expects `id` (string) instead of `_id`
      id: doc?._id ? doc._id.toString() : undefined,
      document_name: doc?.document_name ?? null,
      link: doc?.link ?? null,
      file_base64: fileBase64,
      createdAt: createdAtValue,
      created_at: created_atValue,
      privacy: doc?.privacy ?? null,
      file_type: doc?.file_type ?? null,
      file_size: doc?.file_size ?? null,
      storage_type: doc?.storage_type ?? null,
      storage_location: doc?.storage_location ?? null,
      shared_with: Array.isArray(doc?.shared_with)
        ? doc.shared_with.map((u: any) => (u?.toString ? u.toString() : u))
        : [],
    };
  }

  static async getClientDocuments(req: Request, res: Response) {
    const t0 = Date.now();
    try {
      const { clientId } = req.params;
      const { status } = req.query;
      const requesterId = (req as any).id;
      const requesterRole = (req as any).role;
      if (!mongoose.Types.ObjectId.isValid(clientId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid clientId",
        });
      }
      if (!mongoose.Types.ObjectId.isValid(requesterId)) {
        return res.status(401).json({
          success: false,
          message: "Invalid requester id in token",
        });
      }

      const clientObjectId = new mongoose.Types.ObjectId(clientId);
      const requesterObjectId = new mongoose.Types.ObjectId(requesterId);

      // Requirement: this endpoint must only return documents owned by the client.
      const baseQuery: any = { uploaded_by: clientObjectId };
      const isOwnerOrAdmin = requesterId === clientId || requesterRole === "admin";

      const conditions: any[] = [baseQuery];

      // Requirement: privacy controls who can see private/fully_private documents.
      if (!isOwnerOrAdmin) {
        conditions.push({
          $or: [
            // Public docs are visible to any authenticated user.
            { privacy: DocumentPrivacy.PUBLIC },
            // Private/fully_private docs are visible only if shared with the requesting lawyer.
            {
              privacy: { $in: [DocumentPrivacy.PRIVATE, DocumentPrivacy.FULLY_PRIVATE] },
              shared_with: requesterObjectId,
            },
          ],
        });
      }

      if (status && status !== "all") {
        conditions.push({ status });
      }

      const matchQuery = conditions.length === 1 ? conditions[0] : { $and: conditions };

      const documents = await UserDocument.find(matchQuery)
        .select("-file_base64")
        .sort({ created_at: -1, createdAt: -1, _id: -1 })
        .lean();
      DocumentController.logPerf("document.clientDocuments", t0, {
        clientId,
        status: status ?? null,
        returned: documents.length,
      });

      res.json({
        success: true,
        data: documents.map((d: any) => DocumentController.normalizeDocumentForUI(d)),
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
   * Get documents for a selected client that are visible to the authenticated lawyer.
   * Endpoint: GET /api/v1/document/lawyer/:clientId
   */
  static async getLawyerDocuments(req: Request, res: Response) {
    const t0 = Date.now();
    try {
      const { clientId } = req.params;
      const { status } = req.query;
      const requesterId = (req as any).id;
      const requesterRole = (req as any).role;

      if (!mongoose.Types.ObjectId.isValid(clientId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid clientId",
        });
      }
      if (!mongoose.Types.ObjectId.isValid(requesterId)) {
        return res.status(401).json({
          success: false,
          message: "Invalid requester id in token",
        });
      }

      const clientObjectId = new mongoose.Types.ObjectId(clientId);
      const requesterObjectId = new mongoose.Types.ObjectId(requesterId);

      const requesterHasClientCases = await Case.exists({
        client_id: clientObjectId,
        lawyer_id: requesterObjectId,
      });

      const requesterCases = await Case.find({
        client_id: clientObjectId,
        lawyer_id: requesterObjectId,
      })
        .select("_id")
        .lean();

      const caseIdsForRequester = requesterCases.map((c: any) => c._id);

      // Association:
      // - always include client-owned uploads (uploaded_by == clientId)
      // - for case-related documents, only include those whose case_id is in the
      //   requesting lawyer's cases for this client (prevents leaking other lawyers' case docs)
      const associationQuery: any =
        caseIdsForRequester.length > 0
          ? { $or: [{ uploaded_by: clientObjectId }, { case_id: { $in: caseIdsForRequester } }] }
          : { uploaded_by: clientObjectId };

      const isAdmin = requesterRole === "admin";
      const isRequesterClient = requesterId === clientId;

      // Privacy:
      // - if requesting lawyer has at least one case for this client: do not require shared_with for `private` docs
      // - otherwise: keep current rule (public OR private/fully_private only if shared_with contains the lawyer)
      // - `fully_private` is still protected by shared_with (unless requester is the client or admin)
      let privacyQuery: any = {};
      if (!isAdmin && !isRequesterClient) {
        if (requesterHasClientCases) {
          privacyQuery = {
            $or: [
              { privacy: DocumentPrivacy.PUBLIC },
              { privacy: DocumentPrivacy.PRIVATE },
              {
                privacy: DocumentPrivacy.FULLY_PRIVATE,
                shared_with: requesterObjectId,
              },
            ],
          };
        } else {
          privacyQuery = {
            $or: [
              { privacy: DocumentPrivacy.PUBLIC },
              {
                privacy: { $in: [DocumentPrivacy.PRIVATE, DocumentPrivacy.FULLY_PRIVATE] },
                shared_with: requesterObjectId,
              },
            ],
          };
        }
      }

      const matchQuery: any =
        Object.keys(privacyQuery).length > 0
          ? { $and: [associationQuery, privacyQuery] }
          : associationQuery;

      if (status && status !== "all") {
        (matchQuery as any).status = status;
      }

      const documents = await UserDocument.find(matchQuery)
        .select("-file_base64")
        .sort({ created_at: -1, createdAt: -1, _id: -1 })
        .lean();
      DocumentController.logPerf("document.lawyerDocuments", t0, {
        clientId,
        status: status ?? null,
        returned: documents.length,
        requesterHasClientCases: Boolean(requesterHasClientCases),
      });

      res.json({
        success: true,
        data: documents.map((d: any) => DocumentController.normalizeDocumentForUI(d)),
      });
    } catch (error: any) {
      console.error("Error fetching lawyer-visible client documents:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to fetch lawyer-visible client documents",
      });
    }
  }

  /**
   * Get documents for a specific case
   */
  static async getCaseDocuments(req: Request, res: Response) {
    try {
      const { caseId } = req.params;
      const { status } = req.query;
      const requesterId = (req as any).id;
      const requesterRole = (req as any).role;

      // Security check: Verify the case exists and the user has access to it
      const associatedCase = await Case.findById(caseId);
      
      if (!associatedCase) {
        return res.status(404).json({
          success: false,
          message: 'Case not found'
        });
      }

      // Check if user is the client, the lawyer, or an admin
      const isClient = associatedCase.client_id.toString() === requesterId;
      const isLawyer = associatedCase.lawyer_id.toString() === requesterId;
      const isAdmin = requesterRole === 'admin';

      if (!isClient && !isLawyer && !isAdmin) {
        return res.status(200).json({
          success: true,
          documents: [],
          total: 0,
          message: 'Access restricted: You do not have permission to view documents for this case'
        });
      }

      const query: any = { case_id: caseId };

      if (status && status !== 'all') {
        query.status = status;
      }

      const documents = await UserDocument.find(query)
        .populate('uploaded_by', 'first_name last_name email account_type')
        .populate('shared_with', 'first_name last_name email account_type')
        .sort({ created_at: -1 });

      res.json({
        success: true,
        documents: documents,
        total: documents.length
      });
    } catch (error: any) {
      console.error('Error fetching case documents:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to fetch case documents'
      });
    }
  }

  /**
   * Get document by ID
   */
  static async getDocumentById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const requesterId = (req as any).id;
      const requesterRole = (req as any).role;

      const document = await UserDocument.findById(id)
        .populate('uploaded_by', 'first_name last_name email');

      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      // Security Check: Verify user has access to this document
      const isOwner = document.uploaded_by && (document.uploaded_by as any)._id.toString() === requesterId;
      const isPublic = document.privacy === DocumentPrivacy.PUBLIC;
      const isShared = document.shared_with && document.shared_with.some(uid => uid.toString() === requesterId);
      const isAdmin = requesterRole === 'admin';

      if (!isOwner && !isPublic && !isShared && !isAdmin) {
          return res.status(403).json({
              success: false,
              message: 'Access denied: You are not authorized to view this document'
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
          // Documents shared with this user
          { shared_with: userId },
          // Public documents (visible to all users)
          { privacy: DocumentPrivacy.PUBLIC }
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
   * Share a private document with specific users (lawyers or clients)
   * Both lawyers and clients can share their private documents
   */
  static async shareDocument(req: Request, res: Response) {
    try {
      const { documentId } = req.params;
      const { userId, userIds } = req.body;

      // Validate input
      if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Please provide user IDs to share with'
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
          message: 'Only private documents can be shared with other users'
        });
      }

      // Verify all provided IDs are valid users (lawyers or clients)
      const users = await User.find({
        _id: { $in: userIds },
        account_type: { $in: ['lawyer', 'client'] }
      });

      if (users.length !== userIds.length) {
        return res.status(400).json({
          success: false,
          message: 'Some provided IDs are not valid users'
        });
      }

      // Share document with users
      const updatedDocument = await UserDocument.findByIdAndUpdate(
        documentId,
        { $addToSet: { shared_with: { $each: userIds } } },
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

      // Both lawyers and clients can set documents to any privacy level (removed restriction)
      // if (user.account_type === 'lawyer' && privacy === DocumentPrivacy.PRIVATE) {
      //   return res.status(403).json({
      //     success: false,
      //     message: 'Lawyers cannot create private documents'
      //   });
      // }

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
   * Get all users for document sharing (lawyers and clients)
   * Used for the unified document privacy selection
   */
  static async getUsersForSharing(req: Request, res: Response) {
    try {
      const { userId } = req.body;

      // Get current user to check role
      const currentUser = await User.findById(userId);
      if (!currentUser) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      // Get all users except the current user
      const users = await User.find(
        { _id: { $ne: userId } },
        'first_name last_name email profile_image account_type pratice_area experience'
      ).sort({ account_type: 1, first_name: 1 }); // Sort by role first, then name

      // Separate lawyers and clients for better organization
      const lawyers = users.filter(user => user.account_type === 'lawyer');
      const clients = users.filter(user => user.account_type === 'client');

      return res.status(200).json({
        success: true,
        users: {
          lawyers,
          clients,
          all: users
        }
      });
    } catch (error: any) {
      console.error('Error getting users for sharing:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get users'
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

  /**
   * Update storage type of a document
   * PATCH /document/:id/storage-type
   */
  static async updateStorageType(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { storage_type, link } = req.body;

      if (!['app', 'cloud', 'app_cloud'].includes(storage_type)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid storage_type. Must be: app, cloud, or app_cloud'
        });
      }

      const updateData: any = { storage_type };
      if (link) updateData.link = link;

      const document = await UserDocument.findByIdAndUpdate(
        id,
        updateData,
        { new: true }
      );

      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      res.json({
        success: true,
        document,
        message: `Storage type updated to ${storage_type}`
      });
    } catch (error: any) {
      console.error('Error updating storage type:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update storage type'
      });
    }
  }

  /**
   * Remove document from cloud access
   * If it's app_cloud, downgrade to app; if it's cloud-only, downgrade to app
   * PATCH /document/:id/remove-cloud
   */
  static async removeFromCloud(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const document = await UserDocument.findById(id);

      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      // If it's app_cloud, downgrade to app; if it's cloud-only, downgrade to app
      let newStorageType: string = 'app';
      if (document.storage_type === 'app_cloud') {
        newStorageType = 'app';
      }

      document.storage_type = newStorageType as StorageType;
      await document.save();

      res.json({
        success: true,
        document,
        message: 'Document removed from cloud'
      });
    } catch (error: any) {
      console.error('Error removing document from cloud:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to remove document from cloud'
      });
    }
  }

  /**
   * Sync documents for desktop app
   * Returns all docs where storage_type is 'app' or 'app_cloud'
   * GET /document/sync
   */
  static async syncDocuments(req: any, res: Response) {
    try {
      const userId = req.id;

      // Fetch all documents where user owns them and storage_type includes 'app'
      const documents = await UserDocument.find({
        uploaded_by: userId,
        storage_type: { $in: ['app', 'app_cloud'] }
      })
        .populate('uploaded_by', 'first_name last_name email account_type')
        .sort({ createdAt: -1 });

      res.json({
        success: true,
        documents,
        count: documents.length
      });
    } catch (error: any) {
      console.error('Error syncing documents:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to sync documents'
      });
    }
  }

  /**
   * View document – returns decompressed base64 data URL for frontend viewing
   * Handles various frontend response formats (viewUrl, fileUrl, file_base64)
   */
  static async viewDocument(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const requesterId = (req as any).id;
      const requesterRole = (req as any).role;

      const document = await UserDocument.findById(id);

      if (!document) {
        return res.status(404).json({ success: false, message: 'Document not found' });
      }

      // Security: verify access
      const isOwner = document.uploaded_by?.toString() === requesterId;
      const isPublic = document.privacy === DocumentPrivacy.PUBLIC;
      const isShared = document.shared_with?.some(uid => uid.toString() === requesterId);
      const isAdmin = requesterRole === 'admin';

      if (!isOwner && !isPublic && !isShared && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You are not authorized to view this document'
        });
      }

      let fileUrl = document.link;
      if (document.file_base64) {
        fileUrl = decompressBase64(document.file_base64);
      }

      if (!fileUrl) {
        return res.status(404).json({ success: false, message: 'No view URL available' });
      }

      return res.status(200).json({
        success: true,
        document_name: document.document_name,
        file_type: document.file_type,
        viewUrl: fileUrl,
        fileUrl: fileUrl,
        file_base64: fileUrl,
        // The frontend explicitly looks for the following keys in candidates:
        url: fileUrl,
        link: fileUrl,
        secureUrl: fileUrl
      });
    } catch (error: any) {
      console.error('Error viewing document:', error);
      return res.status(500).json({ success: false, message: error.message || 'Failed to view document' });
    }
  }

  /**
   * Generate Secure Link
   * POST /api/v1/document/generate-secure-link
   */
  static async generateSecureLink(req: Request, res: Response) {
    try {
      const { documentId, fileId } = req.body;
      const targetId = documentId || fileId; // Frontend currently sends `fileId`
      
      if (!targetId) {
         return res.status(400).json({ success: false, message: 'documentId or fileId is required' });
      }

      const document = await UserDocument.findById(targetId);

      if (!document) {
        return res.status(404).json({ success: false, message: 'Document not found' });
      }

      // Generate a secure link format the frontend expects
      const secureLinkUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/view-document/${document._id}`;
      return res.status(200).json({
        success: true,
        message: 'Secure link generated successfully',
        secureLink: secureLinkUrl,
        secureUrl: secureLinkUrl,
        url: secureLinkUrl,
        link: secureLinkUrl
      });
    } catch (error: any) {
      console.error('Error generating secure link:', error);
      return res.status(500).json({ success: false, message: error.message || 'Failed to generate secure link' });
    }
  }

  /**
   * Download document – returns decompressed base64 data URL for frontend download
   * GET /api/v1/document/:id/download
   */
  static async downloadDocument(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const requesterId = (req as any).id;
      const requesterRole = (req as any).role;

      const document = await UserDocument.findById(id);

      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      // Security: verify access
      const isOwner = document.uploaded_by?.toString() === requesterId;
      const isPublic = document.privacy === DocumentPrivacy.PUBLIC;
      const isShared = document.shared_with?.some(uid => uid.toString() === requesterId);
      const isAdmin = requesterRole === 'admin';

      if (!isOwner && !isPublic && !isShared && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: You are not authorized to download this document'
        });
      }

      // If file_base64 exists, decompress and return
      if (document.file_base64) {
        const decompressed = decompressBase64(document.file_base64);
        return res.status(200).json({
          success: true,
          document_name: document.document_name,
          file_type: document.file_type,
          file_base64: decompressed,
          // Explicit frontend format: 
          url: decompressed,
          link: decompressed
        });
      }

      // Fallback: return the link if no base64 stored
      if (document.link) {
        return res.status(200).json({
          success: true,
          document_name: document.document_name,
          file_type: document.file_type,
          link: document.link,
          url: document.link
        });
      }

      return res.status(404).json({
        success: false,
        message: 'No downloadable content found for this document'
      });
    } catch (error: any) {
      console.error('Error downloading document:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to download document'
      });
    }
  }
}
