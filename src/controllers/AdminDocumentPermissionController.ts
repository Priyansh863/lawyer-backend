import { Request, Response } from "express";
import mongoose from "mongoose";
import UserDocument, { DocumentPrivacyLevel } from "../models/user_documents";
import DocumentPermission from "../models/DocumentPermission";
import DocumentPermissionAuditLog from "../models/DocumentPermissionAuditLog";
import { User } from "../models/user";
import { getAuthUserId } from "../middleware/auth";

class AdminDocumentPermissionController {
  private static async hasAccessForUser(doc: any, userId: string): Promise<{ hasAccess: boolean; reason: string }> {
    if (!doc) return { hasAccess: false, reason: "DOCUMENT_NOT_FOUND" };
    const ownerId = doc.uploaded_by?.toString?.();
    if (ownerId && ownerId === userId) return { hasAccess: true, reason: "OWNER" };

    const level = (doc.privacy_level as DocumentPrivacyLevel | undefined) || DocumentPrivacyLevel.PRIVATE_SHARED;
    if (level === DocumentPrivacyLevel.PUBLIC || doc.privacy === "public") return { hasAccess: true, reason: "PUBLIC" };

    const activePerm = await DocumentPermission.exists({
      document_id: doc._id,
      user_id: new mongoose.Types.ObjectId(userId),
      revoked_at: null
    });
    if (activePerm) return { hasAccess: true, reason: "EXPLICIT_PERMISSION" };

    const revokedPerm = await DocumentPermission.exists({
      document_id: doc._id,
      user_id: new mongoose.Types.ObjectId(userId),
      revoked_at: { $ne: null }
    });
    if (revokedPerm) return { hasAccess: false, reason: "REVOKED" };
    return { hasAccess: false, reason: "NOT_ALLOWED" };
  }

  static async listDocuments(req: Request, res: Response) {
    try {
      const search = String(req.query.search || "").trim();
      const page = Math.max(Number(req.query.page || 1), 1);
      const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), 100);
      const skip = (page - 1) * limit;

      const query: any = {};
      if (search) query.document_name = { $regex: search, $options: "i" };

      const [documents, total] = await Promise.all([
        UserDocument.find(query)
          .populate("uploaded_by", "first_name last_name email")
          .sort({ created_at: -1, createdAt: -1, _id: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        UserDocument.countDocuments(query)
      ]);

      const docIds = documents.map((d: any) => d._id);
      const accessCounts = await DocumentPermission.aggregate([
        { $match: { document_id: { $in: docIds }, revoked_at: null } },
        { $group: { _id: "$document_id", count: { $sum: 1 } } }
      ]);
      const accessCountMap = new Map(accessCounts.map((x: any) => [x._id.toString(), x.count]));

      res.status(200).json({
        success: true,
        data: {
          documents: documents.map((d: any) => ({
            id: d._id,
            name: d.document_name,
            ownerName: d.uploaded_by ? `${d.uploaded_by.first_name || ""} ${d.uploaded_by.last_name || ""}`.trim() : null,
            ownerId: d.uploaded_by?._id || d.uploaded_by,
            privacyLevel: d.privacy_level || DocumentPrivacyLevel.PRIVATE_SHARED,
            accessCount: accessCountMap.get(d._id.toString()) || 0,
          })),
          pagination: {
            currentPage: page,
            perPage: limit,
            total,
            totalPages: total === 0 ? 0 : Math.ceil(total / limit)
          }
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || "Failed to list documents" });
    }
  }

  static async getDocumentAccess(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const doc = await UserDocument.findById(id).populate("uploaded_by", "first_name last_name email");
      if (!doc) return res.status(404).json({ success: false, message: "Document not found" });

      const ownerId = (doc.uploaded_by as any)?._id || doc.uploaded_by;
      const activePerms = await DocumentPermission.find({ document_id: id, revoked_at: null }).select("user_id");
      const withAccessIds = activePerms.map((p: any) => p.user_id.toString());
      const withAccessUsers = withAccessIds.length
        ? await User.find({ _id: { $in: withAccessIds } }).select("first_name last_name email")
        : [];

      const availableUsers = await User.find({
        _id: { $nin: [ownerId, ...withAccessIds] }
      }).select("first_name last_name email");

      res.status(200).json({
        success: true,
        data: {
          owner: {
            id: (doc.uploaded_by as any)?._id || doc.uploaded_by,
            name: `${(doc.uploaded_by as any)?.first_name || ""} ${(doc.uploaded_by as any)?.last_name || ""}`.trim(),
            email: (doc.uploaded_by as any)?.email || null,
          },
          usersWithAccess: withAccessUsers.map((u: any) => ({
            id: u._id,
            name: `${u.first_name || ""} ${u.last_name || ""}`.trim(),
            email: u.email,
          })),
          availableUsers: availableUsers.map((u: any) => ({
            id: u._id,
            name: `${u.first_name || ""} ${u.last_name || ""}`.trim(),
            email: u.email,
          })),
          privacyLevel: (doc as any).privacy_level || DocumentPrivacyLevel.PRIVATE_SHARED,
          lastVerifiedAt: new Date().toISOString(),
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || "Failed to fetch access info" });
    }
  }

  static async grantAccess(req: Request, res: Response) {
    const adminUserId = getAuthUserId(req)!;
    const session = await mongoose.startSession();
    try {
      const { id } = req.params;
      const userIds = Array.isArray(req.body?.userIds) ? req.body.userIds : [];
      if (!userIds.length) return res.status(400).json({ success: false, message: "userIds is required" });

      const doc = await UserDocument.findById(id).session(session);
      if (!doc) return res.status(404).json({ success: false, message: "Document not found" });

      const existingUsers = await User.find({ _id: { $in: userIds } }).select("_id").session(session);
      if (existingUsers.length !== userIds.length) {
        return res.status(400).json({ success: false, message: "Some userIds are invalid" });
      }

      let affected = 0;
      await session.withTransaction(async () => {
        for (const userId of userIds) {
          const result = await DocumentPermission.updateOne(
            { document_id: id, user_id: userId },
            {
              $set: {
                granted_by: adminUserId,
                granted_at: new Date(),
                revoked_at: null,
                revoked_by: null,
              }
            },
            { upsert: true, session }
          );
          if ((result as any).modifiedCount || (result as any).upsertedCount) affected += 1;
          await DocumentPermissionAuditLog.create([{
            document_id: id,
            actor_id: adminUserId,
            action: "GRANT",
            target_user_id: userId,
          }], { session });
        }
        await UserDocument.updateOne({ _id: id }, { $addToSet: { shared_with: { $each: userIds } } }, { session });
      });

      return res.status(200).json({ success: true, affected });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || "Failed to grant access" });
    } finally {
      session.endSession();
    }
  }

  static async revokeAccess(req: Request, res: Response) {
    const adminUserId = getAuthUserId(req)!;
    const session = await mongoose.startSession();
    try {
      const { id } = req.params;
      const userIds = Array.isArray(req.body?.userIds) ? req.body.userIds : [];
      if (!userIds.length) return res.status(400).json({ success: false, message: "userIds is required" });

      const doc = await UserDocument.findById(id).session(session);
      if (!doc) return res.status(404).json({ success: false, message: "Document not found" });
      const ownerId = doc.uploaded_by.toString();
      if (userIds.some((u: string) => u === ownerId)) {
        return res.status(400).json({ success: false, message: "Cannot revoke owner access" });
      }

      let affected = 0;
      await session.withTransaction(async () => {
        const result = await DocumentPermission.updateMany(
          { document_id: id, user_id: { $in: userIds }, revoked_at: null },
          { $set: { revoked_at: new Date(), revoked_by: adminUserId } },
          { session }
        );
        affected = (result as any).modifiedCount || 0;
        await UserDocument.updateOne({ _id: id }, { $pull: { shared_with: { $in: userIds } } }, { session });
        for (const userId of userIds) {
          await DocumentPermissionAuditLog.create([{
            document_id: id,
            actor_id: adminUserId,
            action: "REVOKE",
            target_user_id: userId,
          }], { session });
        }
      });

      return res.status(200).json({ success: true, affected });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || "Failed to revoke access" });
    } finally {
      session.endSession();
    }
  }

  static async updatePrivacy(req: Request, res: Response) {
    const adminUserId = getAuthUserId(req)!;
    try {
      const { id } = req.params;
      const { privacyLevel } = req.body as { privacyLevel?: DocumentPrivacyLevel };
      if (!privacyLevel || !Object.values(DocumentPrivacyLevel).includes(privacyLevel)) {
        return res.status(400).json({ success: false, message: "Invalid privacyLevel" });
      }

      const doc = await UserDocument.findById(id);
      if (!doc) return res.status(404).json({ success: false, message: "Document not found" });
      const old = (doc as any).privacy_level || DocumentPrivacyLevel.PRIVATE_SHARED;
      const privacyLegacy =
        privacyLevel === DocumentPrivacyLevel.PUBLIC ? "public" : "private";

      const updatePayload: Record<string, unknown> = {
        privacy_level: privacyLevel,
        privacy: privacyLegacy,
      };
      if (privacyLegacy === "public") {
        updatePayload.shared_with = [];
      }

      const updated = await UserDocument.findByIdAndUpdate(
        id,
        updatePayload,
        { new: true }
      );

      await DocumentPermissionAuditLog.create({
        document_id: id,
        actor_id: adminUserId,
        action: "PRIVACY_UPDATE",
        old_value: { privacyLevel: old },
        new_value: { privacyLevel },
      });

      return res.status(200).json({
        success: true,
        data: {
          id: updated?._id,
          name: updated?.document_name,
          ownerId: updated?.uploaded_by,
          privacyLevel: (updated as any)?.privacy_level,
        }
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || "Failed to update privacy" });
    }
  }

  static async accessCheck(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const userId = String(req.query.userId || "");
      if (!userId) return res.status(400).json({ success: false, message: "userId is required" });
      const doc = await UserDocument.findById(id);
      const result = await AdminDocumentPermissionController.hasAccessForUser(doc, userId);
      return res.status(200).json({
        success: true,
        hasAccess: result.hasAccess,
        reason: result.reason,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message || "Failed access check" });
    }
  }
}

export default AdminDocumentPermissionController;
