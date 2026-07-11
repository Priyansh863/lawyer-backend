import { Request, Response } from "express";
import { uploadImg, ingestS3UploadToStoredBase64, roundTripBase64ViaS3ToStoredBase64, getShortLivedPresignedGetUrl } from "../utils/fileUpload";
import UserDocument, { DocumentPrivacy, DocumentPrivacyLevel, DocumentStatus, DocumentType, StorageType } from "../models/user_documents";
import AIService from "../services/AIService";
import { isPDFFile } from "../utils/pdfUtils";
import { compressBase64, decompressBase64 } from "../utils/documentUtils";
import path from "path";
import { User } from "../models/user";
import Case from "../models/case";
import mongoose from "mongoose";
import { NotificationService } from '../services/notificationService';
import DocumentPermission from "../models/DocumentPermission";
import DocumentPermissionAuditLog from "../models/DocumentPermissionAuditLog";

export default class DocumentController {
  private static logPerf(label: string, startedAtMs: number, extra?: Record<string, any>) {
    const elapsedMs = Date.now() - startedAtMs;
    const base = extra ? ` ${JSON.stringify(extra)}` : "";
    console.log(`[perf] ${label} ${elapsedMs}ms${base}`);
  }

  private static getSyncLocationLabel(storageType?: string | null): string {
    if (storageType === StorageType.APP) return "PC";
    if (storageType === StorageType.CLOUD) return "Cloud";
    if (storageType === StorageType.APP_CLOUD) return "PC + Cloud";
    return "Unknown";
  }

  private static logStorageAudit(params: {
    action: string;
    user_id: string;
    document_id: string;
    before_type?: string | null;
    after_type?: string | null;
    note?: string;
  }) {
    console.log("[audit] document-storage-transition", {
      action: params.action,
      user_id: params.user_id,
      document_id: params.document_id,
      before_type: params.before_type ?? null,
      after_type: params.after_type ?? null,
      note: params.note ?? null,
      at: new Date().toISOString(),
    });
  }

  private static isStorageMutationAuthorized(doc: any, userId?: string): boolean {
    if (!userId || !doc) return false;
    const isOwner = doc.uploaded_by?.toString?.() === userId;
    const isExplicitParticipant = Array.isArray(doc.shared_with)
      ? doc.shared_with.some((u: any) => u?.toString?.() === userId)
      : false;
    return isOwner || isExplicitParticipant;
  }

  /** Map legacy DB values to public | private for API responses. */
  private static normalizeResponsePrivacy(privacy?: string | null): DocumentPrivacy {
    if (privacy === DocumentPrivacy.PUBLIC) return DocumentPrivacy.PUBLIC;
    return DocumentPrivacy.PRIVATE;
  }

  private static parsePrivacyInput(
    privacy: unknown
  ): { ok: true; value: DocumentPrivacy } | { ok: false; status: number; message: string } {
    if (privacy === undefined || privacy === null || privacy === "") {
      return { ok: true, value: DocumentPrivacy.PRIVATE };
    }
    if (privacy === "fully_private") {
      return {
        ok: false,
        status: 400,
        message: "fully_private is no longer supported. Use private instead.",
      };
    }
    if (privacy === DocumentPrivacy.PUBLIC || privacy === DocumentPrivacy.PRIVATE) {
      return { ok: true, value: privacy };
    }
    return {
      ok: false,
      status: 400,
      message: 'Invalid privacy setting. Must be "public" or "private".',
    };
  }

  private static mapPrivacyFilterParam(privacy: unknown): DocumentPrivacy | null {
    if (!privacy || privacy === "all") return null;
    if (privacy === "fully_private") return DocumentPrivacy.PRIVATE;
    if (privacy === DocumentPrivacy.PUBLIC || privacy === DocumentPrivacy.PRIVATE) {
      return privacy;
    }
    return null;
  }

  private static getDocumentOwnerId(doc: any): string {
    if (!doc?.uploaded_by) return "";
    return doc.uploaded_by._id
      ? doc.uploaded_by._id.toString()
      : doc.uploaded_by.toString();
  }

  /** True when privacy is public (field or legacy privacy_level). */
  private static isPublicDocument(doc: any): boolean {
    if (doc?.privacy === DocumentPrivacy.PUBLIC) return true;
    if (doc?.privacy_level === DocumentPrivacyLevel.PUBLIC) return true;
    return false;
  }

  private static getAuthUserId(req: Request): string | null {
    const id = (req as any).id || (req as any).user?.userId;
    return id ? String(id) : null;
  }

  private static canAccessDocument(userId: string | undefined, role: string | undefined, doc: any): boolean {
    if (!userId || !doc) return false;
    if (role === "admin") return true;
    const ownerId = DocumentController.getDocumentOwnerId(doc);
    if (ownerId && ownerId === userId) return true;
    if (DocumentController.isPublicDocument(doc)) return true;
    const privacy = DocumentController.normalizeResponsePrivacy(doc.privacy);
    if (privacy === DocumentPrivacy.PUBLIC) return true;
    if (privacy === DocumentPrivacy.PRIVATE) {
      return (
        Array.isArray(doc.shared_with) &&
        doc.shared_with.some(
          (u: any) => (u?._id ? u._id.toString() : u?.toString?.()) === userId
        )
      );
    }
    return false;
  }

  /** Async access check including explicit DocumentPermission grant/revoke. */
  private static async canAccessDocumentAsync(
    userId: string | undefined,
    role: string | undefined,
    doc: any
  ): Promise<boolean> {
    if (!userId || !doc) return false;
    if (role === "admin") return true;
    const ownerId = DocumentController.getDocumentOwnerId(doc);
    if (ownerId && ownerId === userId) return true;
    if (DocumentController.isPublicDocument(doc)) return true;

    const docId = doc._id;
    const revoked = await DocumentPermission.exists({
      document_id: docId,
      user_id: new mongoose.Types.ObjectId(userId),
      revoked_at: { $ne: null },
    });
    if (revoked) return false;

    const activePerm = await DocumentPermission.exists({
      document_id: docId,
      user_id: new mongoose.Types.ObjectId(userId),
      revoked_at: null,
    });
    if (activePerm) return true;

    const privacy = DocumentController.normalizeResponsePrivacy(doc.privacy);
    if (privacy === DocumentPrivacy.PRIVATE) {
      return (
        Array.isArray(doc.shared_with) &&
        doc.shared_with.some(
          (u: any) => (u?._id ? u._id.toString() : u?.toString?.()) === userId
        )
      );
    }
    return false;
  }

  private static toPrivacyLevel(privacy?: string | null): DocumentPrivacyLevel {
    if (DocumentController.normalizeResponsePrivacy(privacy) === DocumentPrivacy.PUBLIC) {
      return DocumentPrivacyLevel.PUBLIC;
    }
    return DocumentPrivacyLevel.PRIVATE_SHARED;
  }

  private static formatAccessUser(user: any) {
    if (!user) return null;
    const id = user._id ? user._id.toString() : user.toString();
    return {
      _id: id,
      first_name: user.first_name ?? "",
      last_name: user.last_name ?? "",
      email: user.email ?? "",
      account_type: user.account_type,
    };
  }

  private static canManageDocumentAccess(
    requesterId: string | undefined,
    requesterRole: string | undefined,
    document: any
  ): boolean {
    if (!requesterId || !document) return false;
    if (requesterRole === "admin") return true;
    const ownerId = document.uploaded_by?._id
      ? document.uploaded_by._id.toString()
      : document.uploaded_by?.toString?.();
    return ownerId === requesterId;
  }

  /** Case-linked client IDs for a lawyer (GET /user/clients-list uses the same rule). */
  private static async getOwnClientIds(lawyerId: string): Promise<string[]> {
    const ids = await Case.distinct("client_id", { lawyer_id: lawyerId });
    return ids.map((id) => id.toString());
  }

  /** Case-linked lawyer IDs for a client. */
  private static async getOwnLawyerIds(clientId: string): Promise<string[]> {
    const ids = await Case.distinct("lawyer_id", { client_id: clientId });
    return ids.map((id) => id.toString());
  }

  private static async isOwnClient(lawyerId: string, clientId: string): Promise<boolean> {
    if (!lawyerId || !clientId) return false;
    return Case.exists({
      lawyer_id: new mongoose.Types.ObjectId(lawyerId),
      client_id: new mongoose.Types.ObjectId(clientId),
    }).then(Boolean);
  }

  private static async isOwnLawyer(clientId: string, lawyerId: string): Promise<boolean> {
    if (!clientId || !lawyerId) return false;
    return Case.exists({
      client_id: new mongoose.Types.ObjectId(clientId),
      lawyer_id: new mongoose.Types.ObjectId(lawyerId),
    }).then(Boolean);
  }

  /**
   * Default grantable pool for Manage Access UI (quick picks):
   * lawyer → own clients; client → own lawyers.
   * Share API also accepts any other valid registered user when manually selected.
   */
  private static async getGrantableCandidateUsers(
    requesterId: string,
    requesterRole: string
  ) {
    const role = (requesterRole || "").toLowerCase();
    if (role === "lawyer") {
      const clientIds = await DocumentController.getOwnClientIds(requesterId);
      return User.find(
        { _id: { $in: clientIds }, account_type: "client" },
        "first_name last_name email account_type"
      )
        .sort({ first_name: 1 })
        .lean();
    }
    if (role === "client") {
      const lawyerIds = await DocumentController.getOwnLawyerIds(requesterId);
      return User.find(
        { _id: { $in: lawyerIds }, account_type: "lawyer" },
        "first_name last_name email account_type"
      )
        .sort({ first_name: 1 })
        .lean();
    }
    return [];
  }

  /** Owner/admin may share with any registered user; validates IDs only. */
  private static async validateShareTargetUsers(
    requesterId: string,
    userIds: string[],
    ownerId?: string
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    if (!uniqueIds.length) {
      return { ok: false, message: "Please provide user IDs to share with" };
    }

    const invalidOid = uniqueIds.filter((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalidOid.length > 0) {
      return { ok: false, message: "Some provided IDs are not valid user IDs" };
    }

    if (uniqueIds.some((id) => id === requesterId)) {
      return { ok: false, message: "You cannot share a document with yourself" };
    }

    if (ownerId && uniqueIds.some((id) => id === ownerId)) {
      return { ok: false, message: "The document owner already has access" };
    }

    const users = await User.find({ _id: { $in: uniqueIds } }).select("_id");
    if (users.length !== uniqueIds.length) {
      return { ok: false, message: "Some provided IDs are not valid registered users" };
    }

    return { ok: true };
  }

  private static async isRemoveAppAuthorized(doc: any, userId: string): Promise<boolean> {
    if (!userId || !doc) return false;
    if (DocumentController.isStorageMutationAuthorized(doc, userId)) return true;
    const requester = await User.findById(userId).select("account_type").lean();
    const role = (requester as any)?.account_type;
    return DocumentController.canAccessDocument(userId, role, doc);
  }

  private static hasPcCopyForDesktopDelete(
    doc: any,
    localPath?: string,
    syncKey?: string
  ): boolean {
    const st = doc.storage_type;
    if (st === StorageType.APP || st === StorageType.APP_CLOUD) return true;
    const pathHint =
      (doc.storage_location && String(doc.storage_location).trim()) ||
      (localPath && String(localPath).trim()) ||
      (syncKey && String(syncKey).trim());
    return st === StorageType.CLOUD && Boolean(pathHint);
  }

  private static canBulkDeleteDocument(doc: any, userId: string, role?: string): boolean {
    if (!userId || !doc) return false;
    if (role === 'admin') return true;
    return doc.uploaded_by?.toString?.() === userId;
  }
  /**
   * Enhanced upload supporting PDF, Image, and Video files with AI processing
   * @param req.body.file (base64 string)
   * @param req.body.fileName (string)
   * Identity is taken from the auth token (req.id / req.user.userId).
   * @param req.body.fileType (optional: 'pdf' | 'image' | 'video')
   */
  static async uploadDocumentEnhanced(req: Request, res: Response) {
    try {
      const user_id = DocumentController.getAuthUserId(req);
      if (!user_id) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const {
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

      const privacyParsed = DocumentController.parsePrivacyInput(privacy);
      if (privacyParsed.ok === false) {
        return res.status(privacyParsed.status).json({ success: false, message: privacyParsed.message });
      }
      const normalizedPrivacy = privacyParsed.value;

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
      if (case_id && normalizedPrivacy !== DocumentPrivacy.PRIVATE) {
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
        status: process_with_ai ? DocumentStatus.PENDING : DocumentStatus.COMPLETED,
        uploaded_by: user_id,
        link: linkForDb,
        file_base64: processedBase64,
        file_type: file_type || fileTypeDisplay,
        document_type: 'general', // Always general, no user selection
        privacy: normalizedPrivacy,
        privacy_level: DocumentController.toPrivacyLevel(normalizedPrivacy),
        file_size: file_size,
        storage_type: storage_type || 'cloud',
        storage_location: storage_location || null,
        summary: process_with_ai ? "" : undefined
      };

      // Only add case_id if privacy is private and case_id is provided
      if (normalizedPrivacy === DocumentPrivacy.PRIVATE && case_id) {
        documentData.case_id = case_id;
      }

      // Save to MongoDB
      const doc = await UserDocument.create(documentData);

      if (associated_user_id) {
        const documentData: any = {
          document_name: document_name,
          status: process_with_ai ? DocumentStatus.PENDING : DocumentStatus.COMPLETED,
          uploaded_by: associated_user_id,
          link: linkForDb,
          file_base64: processedBase64,
          file_type: file_type || fileTypeDisplay,
          document_type: 'general', // Always general, no user selection
          privacy: normalizedPrivacy,
          privacy_level: DocumentController.toPrivacyLevel(normalizedPrivacy),
          file_size: file_size,
          storage_type: storage_type || 'cloud',
          storage_location: storage_location || null,
          summary: process_with_ai ? "" : undefined
        };
        await UserDocument.create(documentData);
      }



      console.log(`Processing ${fileTypeDisplay} document: ${doc._id}`);

      // Process document with AI service asynchronously if requested
      if (process_with_ai && document_name) {
        AIService.processDocument(doc._id.toString())
          .then(async (aiResult: any) => {
            if (aiResult?.success) {
              await UserDocument.findByIdAndUpdate(doc._id, {
                status: DocumentStatus.COMPLETED,
                summary: aiResult.summary || '',
                summary_generated_at: new Date()
              } as any);

              // Send notification for document upload if public (after AI processing)
              try {
                if (normalizedPrivacy === DocumentPrivacy.PUBLIC) {
                  await NotificationService.notifyDocumentUploaded(doc, user_id);
                }
              } catch (notificationError) {
                console.error('Failed to send document upload notification:', notificationError);
              }
            } else {
              await UserDocument.findByIdAndUpdate(doc._id, {
                status: DocumentStatus.FAILED,
                summary: ''
              } as any);
            }
          })
          .catch(async (aiError: any) => {
            console.error('AI processing error:', aiError);
            await UserDocument.findByIdAndUpdate(doc._id, {
              status: DocumentStatus.FAILED,
              summary: ''
            } as any);
          });

        return res.status(200).json({
          success: true,
          message: `${fileTypeDisplay} uploaded successfully. AI processing started in background.`,
          process_with_ai: true,
          document: doc
        });
      } else {
        // Send notification for document upload if public
        try {
          if (normalizedPrivacy === DocumentPrivacy.PUBLIC) {
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

      const privacyParsed = DocumentController.parsePrivacyInput(privacy);
      if (privacyParsed.ok === false) {
        return res.status(privacyParsed.status).json({ success: false, message: privacyParsed.message });
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
        privacy: privacyParsed.value,
        privacy_level: DocumentController.toPrivacyLevel(privacyParsed.value),
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
   * Identity is taken from the auth token (req.id / req.user.userId).
   */
  static async uploadDocument(req: Request, res: Response) {
    try {
      const userId = DocumentController.getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const { fileUrl, fileName, privacy, file_base64 } = req.body;

      if (!fileName) {
        return res.status(400).json({
          success: false,
          message: "fileName is required"
        });
      }

      const s3RoundTrip = await roundTripBase64ViaS3ToStoredBase64(file_base64, fileName, userId);
      const s3Ingest = s3RoundTrip ?? (await ingestS3UploadToStoredBase64(fileUrl, file_base64));
      const storedBase64 = s3Ingest?.file_base64 ?? (file_base64 ? compressBase64(file_base64) : undefined);

      if (!storedBase64 && !s3Ingest) {
        return res.status(400).json({
          success: false,
          message: "No valid file content provided. Supply base64 file data or a valid platform S3 URL.",
        });
      }

      const privacyParsed = DocumentController.parsePrivacyInput(privacy);
      if (privacyParsed.ok === false) {
        return res.status(privacyParsed.status).json({ success: false, message: privacyParsed.message });
      }
      const normalizedPrivacy = privacyParsed.value;

      // Save to MongoDB
      const doc = await UserDocument.create({
        document_name: fileName,
        status: "Pending",
        uploaded_by: userId,
        link: undefined,
        file_base64: storedBase64,
        privacy: normalizedPrivacy,
        privacy_level: DocumentController.toPrivacyLevel(normalizedPrivacy),
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
          fileUrl: null,
          document: doc,
          message: "Document uploaded successfully. AI processing started in background."
        });
      }

      // Send notification for document upload if public
      try {
        if (normalizedPrivacy === DocumentPrivacy.PUBLIC) {
          await NotificationService.notifyDocumentUploaded(doc, userId);
        }
      } catch (notificationError) {
        console.error('Failed to send document upload notification:', notificationError);
      }

      // For non-PDF files, just return success
      return res.status(200).json({ success: true, fileUrl: null, document: doc });
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

      // Owner-only "My documents" list. Shared docs are returned by /shared-with-me.
      const query = { uploaded_by: req.id };

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

      const normalizedDocuments = documents.map((doc: any) => ({
        _id: doc?._id,
        document_name: doc?.document_name ?? null,
        status: doc?.status ?? null,
        summary: doc?.summary ?? doc?.ai_summary ?? null,
        privacy: DocumentController.normalizeResponsePrivacy(doc?.privacy),
        shared_with: doc?.shared_with ?? [],
        file_size: (() => {
          const rawFileSize = doc?.file_size ?? doc?.fileSize ?? doc?.size;
          const isFolder = String(doc?.file_type || '').toLowerCase() === 'folder';
          const parsedFileSize = Number(rawFileSize);
          return isFolder ? 0 : (Number.isFinite(parsedFileSize) ? parsedFileSize : 0);
        })(),
        storage_type: doc?.storage_type ?? null,
        storage_location: doc?.storage_location ?? null,
        link: doc?.link ?? null,
        created_at: doc?.createdAt ?? doc?.created_at ?? null,
        updated_at: doc?.updatedAt ?? doc?.updated_at ?? null,
        syncLocationLabel: DocumentController.getSyncLocationLabel(doc?.storage_type ?? null),
      }));

      return res.status(200).json({
        success: true,
        documents: normalizedDocuments,
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
   * All other users' public documents (not scoped by client/case/network).
   * GET /api/v1/document/public
   */
  static async listPublicDocuments(req: any, res: Response) {
    const t0 = Date.now();
    try {
      const userId = req.id as string | undefined;
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const page = Math.max(parseInt(req.query.page as string) || 1, 1);
      const limitRaw = parseInt(req.query.limit as string) || 100;
      const limit = Math.min(Math.max(limitRaw, 1), 500);
      const skip = (page - 1) * limit;
      const userObjectId = new mongoose.Types.ObjectId(userId);
      const matchQuery = DocumentController.buildOtherUsersPublicQuery(userObjectId);

      const [documents, total] = await Promise.all([
        UserDocument.find(matchQuery)
          .select("-file_base64")
          .populate("uploaded_by", "first_name last_name email account_type")
          .sort({ created_at: -1, createdAt: -1, _id: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        UserDocument.countDocuments(matchQuery),
      ]);

      const visible = documents
        .filter(
          (d: any) =>
            DocumentController.getDocumentOwnerId(d) !== userId &&
            DocumentController.canAccessDocument(userId, req.role, d)
        )
        .map((d: any) => DocumentController.normalizeDocumentForUI(d));

      DocumentController.logPerf("document.public", t0, {
        page,
        limit,
        returned: visible.length,
        total,
      });

      return res.status(200).json({
        success: true,
        documents: visible,
        pagination: {
          currentPage: page,
          perPage: limit,
          total,
          totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      console.error("List public documents error:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to list public documents",
      });
    }
  }

  /**
   * Shared & Public tab: other users' private docs shared with me + all other users' public docs.
   * Excludes the current user's own uploads (those appear under My Documents).
   * GET /api/v1/document/shared-with-me?includePublic=true
   */
  static async listSharedWithMe(req: any, res: Response) {
    const t0 = Date.now();
    try {
      const userId = req.id as string | undefined;
      if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const page = Math.max(parseInt(req.query.page as string) || 1, 1);
      const limitRaw = parseInt(req.query.limit as string) || 100;
      const limit = Math.min(Math.max(limitRaw, 1), 500);
      const skip = (page - 1) * limit;
      const includePublic =
        req.query.includePublic === undefined ||
        req.query.includePublic === "true" ||
        req.query.includePublic === "1";

      const userObjectId = new mongoose.Types.ObjectId(userId);
      const matchQuery = DocumentController.buildSharedWithMeQuery(userObjectId, includePublic);

      const [documents, total] = await Promise.all([
        UserDocument.find(matchQuery)
          .select("-file_base64")
          .populate("uploaded_by", "first_name last_name email account_type")
          .sort({ created_at: -1, createdAt: -1, _id: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        UserDocument.countDocuments(matchQuery),
      ]);

      const visible = documents
        .filter(
          (d: any) =>
            DocumentController.getDocumentOwnerId(d) !== userId &&
            DocumentController.canAccessDocument(userId, req.role, d)
        )
        .map((d: any) => DocumentController.normalizeDocumentForUI(d));

      DocumentController.logPerf("document.sharedWithMe", t0, {
        page,
        limit,
        includePublic,
        returned: visible.length,
        total,
      });

      return res.status(200).json({
        success: true,
        documents: visible,
        pagination: {
          currentPage: page,
          perPage: limit,
          total,
          totalPages: total === 0 ? 0 : Math.ceil(total / limit),
        },
      });
    } catch (error: any) {
      console.error("List shared-with-me error:", error);
      return res.status(500).json({ success: false, message: error.message || "Failed to list shared documents" });
    }
  }

  /**
   * Upload document with privacy settings and optional AI processing
   * @param req.body.file (base64 string)
   * @param req.body.fileName (string)
   * Identity is taken from the auth token (req.id / req.user.userId).
   * @param req.body.privacy (string, 'public' or 'private')
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
      const userId = DocumentController.getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const {
        fileUrl,
        file_base64,
        fileName,
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

      const privacyParsed = DocumentController.parsePrivacyInput(req.body.privacy);
      if (privacyParsed.ok === false) {
        return res.status(privacyParsed.status).json({ success: false, message: privacyParsed.message });
      }
      const resolvedPrivacy = privacyParsed.value;

      // Get user to check role
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      // Validation for privacy options
      if (resolvedPrivacy === DocumentPrivacy.PRIVATE && selectedUsers.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Private documents must have at least one selected user"
        });
      }

      // Both lawyers and clients can upload all document types (removed restriction)

      // Prepare shared_with array based on privacy setting
      let sharedWith: string[] = [];
      if (resolvedPrivacy === DocumentPrivacy.PRIVATE) {
        sharedWith = selectedUsers;
      }

      const s3RoundTrip = await roundTripBase64ViaS3ToStoredBase64(file_base64, fileName, userId);
      const s3Ingest = s3RoundTrip ?? (await ingestS3UploadToStoredBase64(fileUrl, file_base64));
      const storedBase64 = s3Ingest?.file_base64 ?? (file_base64 ? compressBase64(file_base64) : undefined);

      // B2: Reject external/public direct URLs — only platform-controlled S3 objects are permitted.
      // If no base64 content and S3 ingest did not succeed, we must not store an uncontrolled link.
      if (!storedBase64 && !s3Ingest) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          success: false,
          message: "No valid file content provided. Supply base64 file data or a valid platform S3 URL.",
        });
      }

      // Save to MongoDB within transaction
      const doc = await UserDocument.create([{
        document_name: fileName,
        status: DocumentStatus.PENDING,
        uploaded_by: userId,
        link: undefined, // Never store raw external URLs — content must be in storedBase64 or platform S3
        file_base64: storedBase64,
        privacy: resolvedPrivacy,
        privacy_level: DocumentController.toPrivacyLevel(resolvedPrivacy),
        file_size: fileSize,
        file_type: fileType,
        document_type: documentType,
        case_id: caseId,
        description,
        shared_with: sharedWith,
        is_secure_link: isSecureLink || false
      }], { session });

      const savedDoc = doc[0];

      // B3: Create DocumentPermission + audit records atomically for each initial grantee
      if (sharedWith.length > 0) {
        const now = new Date();
        const permDocs = sharedWith.map((granteeId: string) => ({
          document_id: savedDoc._id,
          user_id: granteeId,
          granted_by: userId,
          granted_at: now,
          revoked_at: null,
          revoked_by: null,
        }));
        await DocumentPermission.create(permDocs, { session });

        const auditDocs = sharedWith.map((granteeId: string) => ({
          document_id: savedDoc._id,
          actor_id: userId,
          action: "GRANT",
          target_user_id: granteeId,
          new_value: { granted_at: now.toISOString(), source: "upload" },
        }));
        await DocumentPermissionAuditLog.create(auditDocs, { session });
      }

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
        if (resolvedPrivacy === DocumentPrivacy.PUBLIC) {
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
        fileUrl: savedDoc.link ?? null,
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
   * Identity is taken from the auth token (req.id / req.user.userId).
   */
  static async uploadDocumentWithSummary(req: Request, res: Response) {
    try {
      const userId = DocumentController.getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const { fileUrl, fileName, file_base64 } = req.body;

      if (!fileUrl || !fileName) {
        return res.status(400).json({
          success: false,
          message: "Missing required fields: fileUrl, fileName"
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

      if (!storedBase64 && !s3Ingest) {
        return res.status(400).json({
          success: false,
          message: "No valid file content provided. Supply base64 file data or a valid platform S3 URL.",
        });
      }

      // Save to MongoDB
      const doc = await UserDocument.create({
        document_name: fileName,
        status: "Pending",
        uploaded_by: userId,
        link: undefined,
        file_base64: storedBase64,
        privacy: DocumentPrivacy.PRIVATE,
        privacy_level: DocumentPrivacyLevel.PRIVATE_SHARED,
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
          fileUrl: null
        });
      } else {
        // AI processing failed, but document is still saved
        return res.status(200).json({
          success: false,
          message: `Document uploaded but AI processing failed: ${aiResult.message}`,
          document: doc,
          fileUrl: null
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

    const rawFileSize = doc?.file_size ?? doc?.fileSize ?? doc?.size;
    const isFolder = String(doc?.file_type || '').toLowerCase() === 'folder';
    const parsedFileSize = Number(rawFileSize);
    const normalizedFileSize = isFolder ? 0 : (Number.isFinite(parsedFileSize) ? parsedFileSize : 0);

    return {
      // UI expects `id` (string) instead of `_id`
      id: doc?._id ? doc._id.toString() : undefined,
      document_name: doc?.document_name ?? null,
      link: doc?.link ?? null,
      file_base64: fileBase64,
      createdAt: createdAtValue,
      created_at: created_atValue,
      privacy: DocumentController.normalizeResponsePrivacy(doc?.privacy),
      privacy_level: doc?.privacy_level ?? DocumentController.toPrivacyLevel(doc?.privacy),
      file_type: doc?.file_type ?? null,
      file_size: normalizedFileSize,
      storage_type: doc?.storage_type ?? null,
      storage_location: doc?.storage_location ?? null,
      case_id: doc?.case_id ? doc.case_id.toString() : null,
      pc_delete_queued_at: doc?.pc_delete_queued_at ?? null,
      shared_with: Array.isArray(doc?.shared_with)
        ? doc.shared_with.map((u: any) => {
            if (u && typeof u === 'object' && !(u instanceof mongoose.Types.ObjectId)) {
              return u;
            }
            return u?.toString ? u.toString() : u;
          })
        : [],
      uploaded_by: DocumentController.getDocumentOwnerId(doc) || null,
      uploaded_by_user:
        doc?.uploaded_by && typeof doc.uploaded_by === "object" && doc.uploaded_by._id
          ? {
              _id: doc.uploaded_by._id.toString(),
              first_name: doc.uploaded_by.first_name,
              last_name: doc.uploaded_by.last_name,
              email: doc.uploaded_by.email,
              account_type: doc.uploaded_by.account_type,
            }
          : null,
    };
  }

  /** Other users' public docs — same set for every logged-in user. */
  private static buildOtherUsersPublicQuery(userObjectId: mongoose.Types.ObjectId) {
    return {
      uploaded_by: { $ne: userObjectId },
      $or: [
        { privacy: DocumentPrivacy.PUBLIC },
        { privacy_level: DocumentPrivacyLevel.PUBLIC },
      ],
    };
  }

  /** Shared & Public tab: private shares + (optionally) all other users' public docs. */
  private static buildSharedWithMeQuery(
    userObjectId: mongoose.Types.ObjectId,
    includePublic: boolean
  ) {
    const orConditions: Record<string, unknown>[] = [
      { privacy: DocumentPrivacy.PRIVATE, shared_with: userObjectId },
    ];
    if (includePublic) {
      orConditions.push({ privacy: DocumentPrivacy.PUBLIC });
      orConditions.push({ privacy_level: DocumentPrivacyLevel.PUBLIC });
    }
    return {
      uploaded_by: { $ne: userObjectId },
      $or: orConditions,
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

      if (!isOwnerOrAdmin) {
        conditions.push({
          $or: [
            { privacy: DocumentPrivacy.PUBLIC },
            { privacy: DocumentPrivacy.PRIVATE, shared_with: requesterObjectId },
            // Legacy rows until migration runs
            { privacy: "fully_private", shared_with: requesterObjectId },
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
        .populate('shared_with', 'first_name last_name email account_type profile_image')
        .lean();
      const visibleDocs = documents.filter((d: any) =>
        DocumentController.canAccessDocument(requesterId, requesterRole, d)
      );
      DocumentController.logPerf("document.clientDocuments", t0, {
        clientId,
        status: status ?? null,
        returned: visibleDocs.length,
      });

      res.json({
        success: true,
        data: visibleDocs.map((d: any) => DocumentController.normalizeDocumentForUI(d)),
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

      const caseAccessQuery: any = {
        client_id: clientObjectId,
        $or: [
          { lawyer_id: requesterObjectId },
          // Some deployments keep additional assignees under assigned_to
          { assigned_to: requesterObjectId },
        ],
      };

      const requesterHasClientCases = await Case.exists(caseAccessQuery);

      const requesterCases = await Case.find(caseAccessQuery)
        .select("_id")
        .lean();

      const caseIdsForRequester = requesterCases.map((c: any) => c._id);
      if (!caseIdsForRequester.length) {
        return res.status(200).json({ success: true, data: [] });
      }

      // Strict server-side privacy guard for lawyers:
      // - document must belong to this client uploader
      // - document must be explicitly tied to one of the lawyer's client cases
      // - documents without case_id are hidden
      const associationQuery: any = {
        uploaded_by: clientObjectId,
        case_id: { $in: caseIdsForRequester },
      };

      const isAdmin = requesterRole === "admin";
      const isRequesterClient = requesterId === clientId;

      let privacyQuery: any = {};
      if (!isAdmin && !isRequesterClient) {
        privacyQuery = {
          $or: [
            { privacy: DocumentPrivacy.PUBLIC },
            { privacy: DocumentPrivacy.PRIVATE, shared_with: requesterObjectId },
            { privacy: "fully_private", shared_with: requesterObjectId },
          ],
        };
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
        .populate('shared_with', 'first_name last_name email account_type profile_image')
        .lean();
      const visibleDocs = documents.filter((d: any) =>
        DocumentController.canAccessDocument(requesterId, requesterRole, d)
      );
      DocumentController.logPerf("document.lawyerDocuments", t0, {
        clientId,
        status: status ?? null,
        returned: visibleDocs.length,
        requesterHasClientCases: Boolean(requesterHasClientCases),
      });

      res.json({
        success: true,
        data: visibleDocs.map((d: any) => DocumentController.normalizeDocumentForUI(d)),
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
        .select("-file_base64")
        .sort({ created_at: -1 })
        .populate('shared_with', 'first_name last_name email account_type profile_image')
        .lean();
      const visibleDocs = documents.filter((d: any) =>
        DocumentController.canAccessDocument(requesterId, requesterRole, d)
      );

      res.json({
        success: true,
        documents: visibleDocs.map((d: any) => DocumentController.normalizeDocumentForUI(d)),
        total: visibleDocs.length
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
      const requesterId = DocumentController.getAuthUserId(req);
      if (!requesterId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      const requesterRole = (req as any).role;

      const document = await UserDocument.findById(id)
        .populate('uploaded_by', 'first_name last_name email account_type profile_image')
        .populate('shared_with', 'first_name last_name email account_type profile_image');

      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      if (!(await DocumentController.canAccessDocumentAsync(requesterId, requesterRole, document))) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      const docJson = document.toObject();
      docJson.privacy = DocumentController.normalizeResponsePrivacy(docJson.privacy);

      res.json({
        success: true,
        data: docJson
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
      const requesterId = (req as any).id as string | undefined;
      const requesterRole = (req as any).role as string | undefined;

      if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status. Must be Pending, Approved, or Rejected'
        });
      }

      const existing = await UserDocument.findById(id);
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      if (!DocumentController.canManageDocumentAccess(requesterId, requesterRole, existing)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      const document = await UserDocument.findByIdAndUpdate(
        id,
        { status },
        { new: true, runValidators: true }
      ).populate('uploaded_by', 'first_name last_name email');

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
      const requesterId = (req as any).id;
      const requesterRole = (req as any).role;

      if (!requesterId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized",
        });
      }
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid document id",
        });
      }

      // The earlier blanket "lawyer" block was removed here.
      // Lawyers should be allowed to delete their own documents. The ownership
      // is securely verified below via `!isOwner && !isAdmin`.

      const existingDocument = await UserDocument.findById(id).select("_id uploaded_by");
      if (!existingDocument) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      const isOwner = existingDocument.uploaded_by?.toString?.() === requesterId;
      const isAdmin = requesterRole === "admin";
      if (!isOwner && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: "Not allowed",
        });
      }

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
      const userId = DocumentController.getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

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

      // Apply filters (map legacy fully_private → private)
      const privacyFilter = DocumentController.mapPrivacyFilterParam(privacy);
      if (privacy && privacy !== "all" && !privacyFilter) {
        return res.status(400).json({
          success: false,
          message: 'Invalid privacy filter. Must be "public" or "private".',
        });
      }
      if (privacyFilter) {
        query.privacy = privacyFilter === DocumentPrivacy.PRIVATE
          ? { $in: [DocumentPrivacy.PRIVATE, "fully_private"] }
          : privacyFilter;
      }
      if (status) {
        query.status = status;
      }
      if (search) {
        query.document_name = { $regex: search, $options: 'i' };
      }

      // Calculate pagination
      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

      const requesterId = userId;
      const requesterRole = (req as any).role;

      // Get documents with pagination
      const documents = await UserDocument.find(query)
        .populate('uploaded_by', 'first_name last_name email account_type')
        .populate('shared_with', 'first_name last_name email account_type')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit as string));

      const accessibleDocuments = documents
        .filter((d: any) => DocumentController.canAccessDocument(requesterId, requesterRole, d))
        .map((d: any) => {
          const plain = d.toObject ? d.toObject() : d;
          plain.privacy = DocumentController.normalizeResponsePrivacy(plain.privacy);
          return plain;
        });

      // Get total count for pagination
      const total = accessibleDocuments.length;

      return res.status(200).json({
        success: true,
        documents: accessibleDocuments,
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
   * GET /api/v1/document/:documentId/access-details
   * Single payload for the Manage Access modal.
   */
  static async getDocumentAccessDetails(req: Request, res: Response) {
    try {
      const { documentId } = req.params;
      const requesterId = (req as any).id as string | undefined;
      const requesterRole = (req as any).role as string | undefined;

      const document = await UserDocument.findById(documentId)
        .populate("uploaded_by", "first_name last_name email account_type")
        .populate("shared_with", "first_name last_name email account_type");

      if (!document) {
        return res.status(404).json({ success: false, message: "Document not found" });
      }

      if (!DocumentController.canManageDocumentAccess(requesterId, requesterRole, document)) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }

      const ownerUser = document.uploaded_by as any;
      const ownerId = ownerUser?._id?.toString?.() || document.uploaded_by?.toString?.() || "";
      const sharedWith = (document.shared_with || []).map((u: any) =>
        DocumentController.formatAccessUser(u)
      );
      const sharedIds = new Set(sharedWith.map((u) => u!._id));

      const candidates = requesterRole === "admin"
        ? await User.find(
            { _id: { $ne: ownerId }, account_type: { $in: ["client", "lawyer"] } },
            "first_name last_name email account_type"
          )
            .sort({ first_name: 1 })
            .lean()
        : await DocumentController.getGrantableCandidateUsers(requesterId!, requesterRole!);

      const candidateSummaries = await Promise.all(
        candidates
          .map((u: any) => DocumentController.formatAccessUser(u))
          .filter((u) => u && u._id !== ownerId)
          .map(async (u) => {
            const role = (requesterRole || "").toLowerCase();
            let relationship: "own_client" | "own_lawyer" | "default_pool" = "default_pool";
            if (role === "lawyer" && (await DocumentController.isOwnClient(requesterId!, u!._id))) {
              relationship = "own_client";
            } else if (role === "client" && (await DocumentController.isOwnLawyer(requesterId!, u!._id))) {
              relationship = "own_lawyer";
            }
            return { ...u, relationship, is_own_client: relationship === "own_client", is_own_lawyer: relationship === "own_lawyer" };
          })
      );

      const normalizedPrivacy = DocumentController.normalizeResponsePrivacy(document.privacy);
      const isPublic = normalizedPrivacy === DocumentPrivacy.PUBLIC;
      const hasAccessCount = isPublic
        ? null
        : candidateSummaries.filter((u) => sharedIds.has(u!._id)).length;
      const grantableUsers = isPublic
        ? []
        : candidateSummaries.filter((u) => !sharedIds.has(u!._id));

      return res.status(200).json({
        success: true,
        document: {
          _id: document._id,
          document_name: document.document_name,
          privacy: normalizedPrivacy,
          shared_with: sharedWith,
          uploaded_by: DocumentController.formatAccessUser(ownerUser),
        },
        owner: DocumentController.formatAccessUser(ownerUser),
        has_access_count: hasAccessCount,
        does_not_have_access_count: isPublic ? null : grantableUsers.length,
        grantable_users: grantableUsers,
        allow_share_with_any_registered_user: true,
        default_grant_pool:
          (requesterRole || "").toLowerCase() === "lawyer"
            ? "own_clients"
            : (requesterRole || "").toLowerCase() === "client"
              ? "own_lawyers"
              : "all_users",
        last_verified_at: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("Error getting document access details:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to get document access details",
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
      const requesterId = (req as any).id as string | undefined;
      const requesterRole = (req as any).role as string | undefined;
      const { userIds } = req.body as { userIds?: string[] };

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

      if (!DocumentController.canManageDocumentAccess(requesterId, requesterRole, document)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden'
        });
      }

      if (DocumentController.normalizeResponsePrivacy(document.privacy) !== DocumentPrivacy.PRIVATE) {
        return res.status(400).json({
          success: false,
          message: 'Sharing is only allowed when document privacy is private',
        });
      }

      const ownerId = document.uploaded_by?.toString();

      const shareCheck = await DocumentController.validateShareTargetUsers(
        requesterId!,
        userIds,
        ownerId
      );
      if (shareCheck.ok === false) {
        return res.status(400).json({ success: false, message: shareCheck.message });
      }

      // Share document with users via transaction
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        const updatedDocument = await UserDocument.findByIdAndUpdate(
          documentId,
          { $addToSet: { shared_with: { $each: userIds } } },
          { new: true, session }
        ).populate('shared_with', 'first_name last_name email account_type profile_image');

        const now = new Date();
        for (const targetUserId of userIds) {
          await DocumentPermission.findOneAndUpdate(
            { document_id: documentId, user_id: targetUserId },
            {
              $set: {
                granted_by: requesterId,
                granted_at: now,
                revoked_at: null,
                revoked_by: null,
              }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true, session }
          );
          await DocumentPermissionAuditLog.create(
            [{
              document_id: documentId,
              actor_id: requesterId,
              action: "GRANT",
              target_user_id: targetUserId,
              new_value: { granted_at: now.toISOString() },
            }],
            { session }
          );
        }

        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
          success: true,
          message: 'Document shared successfully',
          document: updatedDocument
        });
      } catch (err: any) {
        await session.abortTransaction();
        session.endSession();
        throw err;
      }
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
      const requesterId = (req as any).id as string | undefined;
      const requesterRole = (req as any).role as string | undefined;
      // Fix: Rename userId to targetUserId to prevent collision with the owner's ID
      // Some old clients might send the target as lawyerId.
      const { targetUserId, lawyerId } = req.body as {
        targetUserId?: string;
        lawyerId?: string;
      };
      const userToRemove = targetUserId || lawyerId;
      if (!userToRemove) {
        return res.status(400).json({ success: false, message: "targetUserId is required" });
      }

      // Find the document
      const document = await UserDocument.findById(documentId);
      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      if (!DocumentController.canManageDocumentAccess(requesterId, requesterRole, document)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden'
        });
      }

      if (DocumentController.normalizeResponsePrivacy(document.privacy) !== DocumentPrivacy.PRIVATE) {
        return res.status(400).json({
          success: false,
          message: 'Unshare is only allowed when document privacy is private',
        });
      }

      // Remove user from shared_with array via transaction
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        const updatedDocument = await UserDocument.findByIdAndUpdate(
          documentId,
          { $pull: { shared_with: userToRemove } },
          { new: true, session }
        ).populate('shared_with', 'first_name last_name email account_type profile_image');

        await DocumentPermission.updateMany(
          { document_id: documentId, user_id: userToRemove, revoked_at: null },
          { $set: { revoked_at: new Date(), revoked_by: requesterId } },
          { session }
        );
        await DocumentPermissionAuditLog.create(
          [{
            document_id: documentId,
            actor_id: requesterId,
            action: "REVOKE",
            target_user_id: userToRemove,
            new_value: { revoked_at: new Date().toISOString() },
          }],
          { session }
        );

        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
          success: true,
          message: 'Document unshared successfully',
          shared_with: updatedDocument?.shared_with ?? [],
          document: updatedDocument
        });
      } catch (err: any) {
        await session.abortTransaction();
        session.endSession();
        throw err;
      }
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
      const requesterId = (req as any).id as string | undefined;
      const requesterRole = (req as any).role as string | undefined;
      const privacyParsed = DocumentController.parsePrivacyInput(req.body.privacy);
      if (privacyParsed.ok === false) {
        return res.status(privacyParsed.status).json({ success: false, message: privacyParsed.message });
      }
      const privacy = privacyParsed.value;

      // Find the document
      const document = await UserDocument.findById(documentId);
      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      if (!DocumentController.canManageDocumentAccess(requesterId, requesterRole, document)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden'
        });
      }

      const updateData: any = {
        privacy,
        privacy_level: DocumentController.toPrivacyLevel(privacy),
      };
      if (privacy === DocumentPrivacy.PUBLIC) {
        updateData.shared_with = [];
      }

      // All writes in a single transaction so permission state and document state never diverge
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        // When transitioning to PUBLIC, revoke all active DocumentPermission records
        // so hidden grants cannot become effective if the document is later set back to Private
        if (privacy === DocumentPrivacy.PUBLIC) {
          await DocumentPermission.updateMany(
            { document_id: documentId, revoked_at: null },
            { $set: { revoked_at: new Date(), revoked_by: requesterId } },
            { session }
          );
        }

        const updatedDocument = await UserDocument.findByIdAndUpdate(
          documentId,
          updateData,
          { new: true, session }
        ).populate('uploaded_by', 'first_name last_name email account_type')
          .populate('shared_with', 'first_name last_name email account_type');

        await DocumentPermissionAuditLog.create(
          [{
            document_id: documentId,
            actor_id: requesterId,
            action: "PRIVACY_UPDATE",
            old_value: {
              privacy: document.privacy,
              privacy_level: document.privacy_level || DocumentController.toPrivacyLevel(document.privacy),
            },
            new_value: {
              privacy: updatedDocument?.privacy,
              privacy_level: (updatedDocument as any)?.privacy_level,
            },
          }],
          { session }
        );

        await session.commitTransaction();
        session.endSession();

        return res.status(200).json({
          success: true,
          message: 'Document privacy updated successfully',
          document: updatedDocument
        });
      } catch (txErr: any) {
        await session.abortTransaction();
        session.endSession();
        throw txErr;
      }
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
      const userId = DocumentController.getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

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
   * Get users eligible for document sharing.
   * Scoped to an owner/admin document-management context:
   *   - documentId must be provided and the requester must own/manage it
   *   - optional `search` (matches first_name, last_name, email prefix)
   *   - pagination: limit (max 50) + offset
   *   - only verified + active accounts
   *   - minimal fields returned (_id, first_name, last_name, account_type)
   */
  static async getUsersForSharing(req: Request, res: Response) {
    try {
      const userId = DocumentController.getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      const requesterRole = (req as any).role;

      // Require documentId to scope the query to a management context
      const documentId = (req.body?.documentId || req.query?.documentId) as string | undefined;
      if (!documentId) {
        return res.status(400).json({ success: false, message: "documentId is required" });
      }

      const document = await UserDocument.findById(documentId).lean();
      if (!document) {
        return res.status(404).json({ success: false, message: "Document not found" });
      }

      // Only the document owner or an admin may enumerate eligible grantees
      if (!DocumentController.canManageDocumentAccess(userId, requesterRole, document)) {
        return res.status(403).json({
          success: false,
          message: "Only the document owner or an administrator can list shareable users",
        });
      }

      // Search filter (optional) — prefix match on first_name, last_name, or email
      const search = (req.body?.search ?? req.query?.search ?? "") as string;
      const rawLimit = parseInt(String(req.body?.limit ?? req.query?.limit ?? "20"), 10);
      const limit = Math.min(Math.max(rawLimit, 1), 50);
      const offset = Math.max(parseInt(String(req.body?.offset ?? req.query?.offset ?? "0"), 10), 0);

      const filterQuery: Record<string, any> = {
        _id: { $ne: userId },
        is_verified: true,
        is_active: { $ne: 0 },
      };
      if (search.trim()) {
        const re = new RegExp("^" + search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        filterQuery.$or = [
          { first_name: re },
          { last_name: re },
          { email: re },
        ];
      }

      const [users, total] = await Promise.all([
        User.find(filterQuery, "_id first_name last_name account_type")
          .sort({ account_type: 1, first_name: 1 })
          .skip(offset)
          .limit(limit)
          .lean(),
        User.countDocuments(filterQuery),
      ]);

      return res.status(200).json({
        success: true,
        data: {
          users,
          total,
          limit,
          offset,
        },
      });
    } catch (error: any) {
      console.error("Error getting users for sharing:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to get users",
      });
    }
  }

  /**
   * Get document sharing details
   * Owner/admin only — granted users must not see the full shared_with list or other grantees' PII.
   */
  static async getDocumentSharingDetails(req: Request, res: Response) {
    try {
      const { documentId } = req.params;
      const userId = DocumentController.getAuthUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      const requesterRole = (req as any).role;

      const document = await UserDocument.findById(documentId)
        .populate('uploaded_by', 'first_name last_name email account_type')
        .populate('shared_with', 'first_name last_name email account_type profile_image');

      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      // Sharing details are owner/admin only — a grantee cannot enumerate other grantees
      if (!DocumentController.canManageDocumentAccess(userId, requesterRole, document)) {
        return res.status(403).json({
          success: false,
          message: 'Only the document owner or an administrator can view sharing details'
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
      const userId = (req as any).id;

      if (!['app', 'cloud', 'app_cloud'].includes(storage_type)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid storage_type. Must be: app, cloud, or app_cloud'
        });
      }

      const existing = await UserDocument.findById(id);
      if (!existing) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      const updateData: any = { storage_type };
      if (link) updateData.link = link;

      const document = await UserDocument.findByIdAndUpdate(
        id,
        updateData,
        { new: true }
      );

      DocumentController.logStorageAudit({
        action: "update_storage_type",
        user_id: userId,
        document_id: id,
        before_type: existing.storage_type,
        after_type: document?.storage_type,
      });

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
      const userId = (req as any).id;
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const document = await UserDocument.findById(id);

      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }
      if (!DocumentController.isStorageMutationAuthorized(document, userId)) {
        DocumentController.logStorageAudit({
          action: "delete_cloud",
          user_id: userId,
          document_id: id,
          before_type: document.storage_type,
          after_type: document.storage_type,
          note: "forbidden",
        });
        return res.status(403).json({
          success: false,
          message: "Forbidden"
        });
      }

      const beforeType = document.storage_type;

      // Idempotent cloud delete semantics:
      // cloud -> remove DB record
      // app_cloud -> remove cloud reference + downgrade to app
      // app -> already no cloud copy; no-op
      if (document.storage_type === StorageType.CLOUD) {
        await UserDocument.findByIdAndDelete(id);
        DocumentController.logStorageAudit({
          action: "delete_cloud",
          user_id: userId,
          document_id: id,
          before_type: beforeType,
          after_type: null,
          note: "cloud-only document deleted from DB after cloud delete",
        });
        return res.json({
          success: true,
          message: 'Cloud object removed and document deleted'
        });
      }

      if (document.storage_type === StorageType.APP_CLOUD) {
        document.storage_type = StorageType.APP;
        document.link = undefined;
        await document.save();
        DocumentController.logStorageAudit({
          action: "delete_cloud",
          user_id: userId,
          document_id: id,
          before_type: beforeType,
          after_type: document.storage_type,
          note: "cloud deleted, retained local/app record",
        });
        return res.json({
          success: true,
          document,
          message: 'Cloud object removed; document now local only'
        });
      }

      // APP: no cloud artifact to remove; keep idempotent success.
      DocumentController.logStorageAudit({
        action: "delete_cloud",
        user_id: userId,
        document_id: id,
        before_type: beforeType,
        after_type: beforeType,
        note: "no-op; document already local-only",
      });

      res.json({
        success: true,
        document,
        message: 'No cloud copy found; document already local only'
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
   * Remove local copy lifecycle action
   * DELETE /document/:id/local
   */
  static async removeFromLocal(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = (req as any).id;
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      const document = await UserDocument.findById(id);

      if (!document) {
        return res.status(200).json({
          success: true,
          message: "Document already removed"
        });
      }
      if (!DocumentController.isStorageMutationAuthorized(document, userId)) {
        DocumentController.logStorageAudit({
          action: "delete_local",
          user_id: userId,
          document_id: id,
          before_type: document.storage_type,
          after_type: document.storage_type,
          note: "forbidden",
        });
        return res.status(403).json({
          success: false,
          message: "Forbidden"
        });
      }

      const beforeType = document.storage_type;

      // app -> remove DB record
      if (beforeType === StorageType.APP) {
        await UserDocument.findByIdAndDelete(id);
        DocumentController.logStorageAudit({
          action: "delete_local",
          user_id: userId,
          document_id: id,
          before_type: beforeType,
          after_type: null,
          note: "local-only record removed from DB",
        });
        return res.status(200).json({
          success: true,
          message: "Local file deleted and document removed"
        });
      }

      // app_cloud -> retain cloud record
      if (beforeType === StorageType.APP_CLOUD) {
        document.storage_type = StorageType.CLOUD;
        await document.save();
        DocumentController.logStorageAudit({
          action: "delete_local",
          user_id: userId,
          document_id: id,
          before_type: beforeType,
          after_type: document.storage_type,
          note: "local removed, retained cloud",
        });
        return res.status(200).json({
          success: true,
          document,
          message: "Local file deleted; document retained in cloud"
        });
      }

      // cloud -> no local artifact, idempotent no-op
      DocumentController.logStorageAudit({
        action: "delete_local",
        user_id: userId,
        document_id: id,
        before_type: beforeType,
        after_type: beforeType,
        note: "no-op; document already cloud-only",
      });
      return res.status(200).json({
        success: true,
        document,
        message: "No local copy found; document already cloud only"
      });
    } catch (error: any) {
      console.error("Error removing document from local storage:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to remove local document"
      });
    }
  }

  /**
   * Queue desktop/Electron client to delete the local file after cloud-only transition.
   * PATCH /document/:id/remove-app
   * Body (optional): { localPath?: string; syncKey?: string }
   */
  static async removeFromApp(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = (req as any).id;
      const localPath = req.body?.localPath as string | undefined;
      const syncKey = req.body?.syncKey as string | undefined;

      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid document id' });
      }

      const document = await UserDocument.findById(id);
      if (!document) {
        return res.status(404).json({ success: false, message: 'Document not found' });
      }

      const allowed = await DocumentController.isRemoveAppAuthorized(document, userId);
      if (!allowed) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      if (document.pc_delete_queued_at) {
        return res.status(200).json({
          success: true,
          queued: false,
          alreadyQueued: true,
          documentId: id,
        });
      }

      if (!DocumentController.hasPcCopyForDesktopDelete(document, localPath, syncKey)) {
        return res.status(400).json({
          success: false,
          message:
            'Document has no PC copy or local path/sync key to delete. Provide localPath or syncKey if the file was only tracked in cloud.',
        });
      }

      const ownerId = document.uploaded_by?.toString?.();
      if (!ownerId) {
        return res.status(400).json({ success: false, message: 'Document has no uploader' });
      }

      document.pc_delete_queued_at = new Date();
      await document.save();

      const payload = {
        documentId: id,
        localPath: localPath || document.storage_location || undefined,
        syncKey: syncKey || undefined,
        storage_type: document.storage_type,
      };

      try {
        const { socketService } = await import('../App');
        if (socketService) {
          socketService.emitToUser(ownerId, 'desktop.remove_local_file', payload);
        }
      } catch {
        // Socket may be unavailable during tests or unusual boot order
      }

      DocumentController.logStorageAudit({
        action: 'remove_app_queue',
        user_id: userId,
        document_id: id,
        before_type: document.storage_type,
        after_type: document.storage_type,
        note: 'desktop delete command emitted',
      });

      return res.status(200).json({
        success: true,
        queued: true,
        documentId: id,
      });
    } catch (error: any) {
      console.error('Error in removeFromApp:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to queue PC file deletion',
      });
    }
  }

  /**
   * Delete many documents in one transaction (owner or admin per document).
   * POST /document/bulk-delete { ids: string[] }
   */
  static async bulkDeleteDocuments(req: Request, res: Response) {
    const userId = (req as any).id;
    const role = (req as any).role;
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (ids.length === 0) {
      return res.status(400).json({ success: false, message: 'ids must be a non-empty array' });
    }
    const unique = [...new Set(ids.map((x: any) => String(x)))].filter((x: string) =>
      mongoose.Types.ObjectId.isValid(x)
    );
    if (unique.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid document ids' });
    }

    const session = await mongoose.startSession();
    try {
      let deleted = 0;
      let skipped = 0;
      await session.withTransaction(async () => {
        for (const docId of unique) {
          const doc = await UserDocument.findById(docId).session(session);
          if (!doc) {
            skipped++;
            continue;
          }
          if (!DocumentController.canBulkDeleteDocument(doc, userId, role)) {
            skipped++;
            continue;
          }
          await UserDocument.deleteOne({ _id: docId }).session(session);
          deleted++;
        }
      });
      return res.status(200).json({
        success: true,
        deleted,
        skipped,
        requested: unique.length,
      });
    } catch (error: any) {
      console.error('bulkDeleteDocuments:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Bulk delete failed',
      });
    } finally {
      session.endSession();
    }
  }

  /**
   * Sync local existence state sent by desktop/agent
   * POST /document/sync-local-state
   * Body: { items: [{ document_id, local_exists }] }
   */
  static async syncLocalState(req: Request, res: Response) {
    try {
      const userId = (req as any).id;
      if (!userId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      const results: any[] = [];

      for (const item of items) {
        const documentId = item?.document_id;
        const localExists = Boolean(item?.local_exists);
        if (!documentId || !mongoose.Types.ObjectId.isValid(documentId)) {
          results.push({
            document_id: documentId,
            success: false,
            status: "not_found",
            message: "Invalid document_id",
          });
          continue;
        }

        const doc = await UserDocument.findById(documentId);
        if (!doc) {
          results.push({
            document_id: documentId,
            success: false,
            status: "not_found",
            message: "Document not found",
          });
          continue;
        }
        if (!DocumentController.isStorageMutationAuthorized(doc, userId)) {
          DocumentController.logStorageAudit({
            action: "sync_local_missing",
            user_id: userId,
            document_id: documentId,
            before_type: doc.storage_type,
            after_type: doc.storage_type,
            note: "forbidden",
          });
          results.push({
            document_id: documentId,
            success: false,
            status: "forbidden",
            message: "Forbidden",
          });
          continue;
        }

        if (localExists) {
          results.push({
            document_id: documentId,
            success: true,
            status: "noop",
            message: "Local file exists; no update required",
          });
          continue;
        }

        const beforeType = doc.storage_type;
        if (beforeType === StorageType.APP) {
          await UserDocument.findByIdAndDelete(documentId);
          DocumentController.logStorageAudit({
            action: "sync_local_missing",
            user_id: userId,
            document_id: documentId,
            before_type: beforeType,
            after_type: null,
          });
          results.push({
            document_id: documentId,
            success: true,
            status: "deleted",
            message: "Local-only record removed",
          });
        } else if (beforeType === StorageType.APP_CLOUD) {
          doc.storage_type = StorageType.CLOUD;
          await doc.save();
          DocumentController.logStorageAudit({
            action: "sync_local_missing",
            user_id: userId,
            document_id: documentId,
            before_type: beforeType,
            after_type: doc.storage_type,
          });
          results.push({
            document_id: documentId,
            success: true,
            status: "updated",
            message: "Local missing; storage_type changed to cloud",
          });
        } else {
          results.push({
            document_id: documentId,
            success: true,
            status: "noop",
            message: "Already cloud-only",
          });
        }
      }

      return res.status(200).json({
        success: true,
        processed: results.length,
        results
      });
    } catch (error: any) {
      console.error("Error syncing local state:", error);
      return res.status(500).json({
        success: false,
        message: error.message || "Failed to sync local state"
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
      const requesterId = DocumentController.getAuthUserId(req);
      if (!requesterId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      const requesterRole = (req as any).role;

      const document = await UserDocument.findById(id).populate('uploaded_by', '_id').populate('shared_with', '_id');

      if (!document) {
        return res.status(404).json({ success: false, message: 'Document not found' });
      }

      if (!(await DocumentController.canAccessDocumentAsync(requesterId, requesterRole, document))) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      let fileUrl = document.link;
      if (document.file_base64) {
        fileUrl = decompressBase64(document.file_base64);
      } else if (fileUrl) {
        fileUrl = await getShortLivedPresignedGetUrl(fileUrl);
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
      const targetId = documentId || fileId;
      const requesterId = DocumentController.getAuthUserId(req);
      if (!requesterId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      const requesterRole = (req as any).role;

      if (!targetId) {
        return res.status(400).json({ success: false, message: 'documentId or fileId is required' });
      }

      const document = await UserDocument.findById(targetId);

      if (!document) {
        return res.status(404).json({ success: false, message: 'Document not found' });
      }

      if (!(await DocumentController.canAccessDocumentAsync(requesterId, requesterRole, document))) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
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
      const requesterId = DocumentController.getAuthUserId(req);
      if (!requesterId) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }
      const requesterRole = (req as any).role;

      const document = await UserDocument.findById(id).populate('uploaded_by', '_id').populate('shared_with', '_id');

      if (!document) {
        return res.status(404).json({
          success: false,
          message: 'Document not found'
        });
      }

      if (!(await DocumentController.canAccessDocumentAsync(requesterId, requesterRole, document))) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
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
        const presignedUrl = await getShortLivedPresignedGetUrl(document.link);
        if (!presignedUrl) {
          return res.status(404).json({
            success: false,
            message: 'No downloadable content found or link is invalid'
          });
        }
        return res.status(200).json({
          success: true,
          document_name: document.document_name,
          file_type: document.file_type,
          link: presignedUrl,
          url: presignedUrl
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

  static async bulkAssignCase(req: Request, res: Response) {
    try {
      const { documentIds, caseId } = req.body;

      if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
        return res.status(400).json({ success: false, message: 'Valid documentIds array is required' });
      }
      if (!caseId) {
        return res.status(400).json({ success: false, message: 'caseId is required' });
      }

      const result = await UserDocument.updateMany(
        { 
          _id: { $in: documentIds }
        },
        { 
          $set: { 
            case_id: caseId,
            document_type: DocumentType.CASE_RELATED || 'case_related'
          } 
        }
      );

      return res.status(200).json({
        success: true,
        modifiedCount: result.modifiedCount,
        message: 'Cases assigned successfully'
      });
    } catch (error) {
      console.error('Error in bulkAssignCase:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
}
