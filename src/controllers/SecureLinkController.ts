import { Request, Response } from 'express';
import mongoose from 'mongoose';
import SecureLink from '../models/SecureLink';
import SecureLinkUpload from '../models/SecureLinkUpload';
import { User } from '../models/user';
import UserDocument from '../models/user_documents';
import { compressBase64 } from '../utils/documentUtils';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import dbConfig from '../config/secretManagerConfig';
import { ISecretManagerData } from '../Interfaces/commonInterfaces';
import { getJwtSecret } from '../utils/jwtSecret';

// Define AuthenticatedRequest interface
interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

class SecureLinkController {
  private static authAttemptWindowMs = 15 * 60 * 1000;
  private static authAttemptLimit = 8;
  private static authAttemptMap = new Map<string, { count: number; firstAt: number }>();

  private static isExpired(expiresAt: Date): boolean {
    return new Date() >= new Date(expiresAt);
  }

  private static getStatus(expiresAt: Date): "active" | "expired" {
    return SecureLinkController.isExpired(expiresAt) ? "expired" : "active";
  }

  private static getClientLabel(secureLink: any): { client_name: string | null; client_email: string | null } {
    if (secureLink.mode === "non_customer") {
      return { client_name: "Non-Customer User", client_email: null };
    }
    return {
      client_name: secureLink.client_id
        ? `${(secureLink.client_id as any).first_name} ${(secureLink.client_id as any).last_name}`
        : null,
      client_email: secureLink.client_id ? (secureLink.client_id as any).email : null,
    };
  }

  private static getAuthKey(req: Request, token: string): string {
    return `${req.ip || "unknown"}:${token}`;
  }

  private static isAuthRateLimited(req: Request, token: string): boolean {
    const key = SecureLinkController.getAuthKey(req, token);
    const now = Date.now();
    const existing = SecureLinkController.authAttemptMap.get(key);
    if (!existing) return false;
    if (now - existing.firstAt > SecureLinkController.authAttemptWindowMs) {
      SecureLinkController.authAttemptMap.delete(key);
      return false;
    }
    return existing.count >= SecureLinkController.authAttemptLimit;
  }

  private static recordAuthFailure(req: Request, token: string) {
    const key = SecureLinkController.getAuthKey(req, token);
    const now = Date.now();
    const existing = SecureLinkController.authAttemptMap.get(key);
    if (!existing || now - existing.firstAt > SecureLinkController.authAttemptWindowMs) {
      SecureLinkController.authAttemptMap.set(key, { count: 1, firstAt: now });
      return;
    }
    existing.count += 1;
    SecureLinkController.authAttemptMap.set(key, existing);
  }

  private static clearAuthFailures(req: Request, token: string) {
    SecureLinkController.authAttemptMap.delete(SecureLinkController.getAuthKey(req, token));
  }

  private static async getOptionalAuthUser(req: Request): Promise<{ userId: string; role: string } | null> {
    const authHeader = (req.headers["auth"] || req.headers["authorization"]) as string | undefined;
    if (!authHeader) return null;
    const token = authHeader.split(" ")[1];
    if (!token || token === "null" || token === "undefined") return null;
    try {
      const dbData = (await dbConfig.secretManagerConnection()) as ISecretManagerData;
      const decoded = jwt.verify(token, dbData.jwtSecretKey) as { _id: string; account_type: string };
      return { userId: decoded._id, role: decoded.account_type };
    } catch {
      return null;
    }
  }
  /**
   * Generate a secure upload link for a client
   * POST /api/v1/secure-link/generate
   */
  static async generateSecureLink(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { client_id, non_customer_user, password, expires_in_hours = 24 } = req.body;
      const lawyer_id = req.user?.userId;

      // Validation
      if (!lawyer_id) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      if (!password) {
        res.status(400).json({
          success: false,
          message: 'Password is required'
        });
        return;
      }

      const hasClientId = Boolean(client_id);
      const isNonCustomerMode = non_customer_user === true;
      if ((hasClientId && isNonCustomerMode) || (!hasClientId && !isNonCustomerMode)) {
        res.status(400).json({
          success: false,
          message: 'Exactly one mode is required: client_id XOR non_customer_user=true',
        });
        return;
      }

      // Validate password strength
      if (password.length < 6) {
        res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters long'
        });
        return;
      }

      // Verify lawyer account
      const lawyer = await User.findById(lawyer_id);
      if (!lawyer || lawyer.account_type !== 'lawyer') {
        res.status(403).json({
          success: false,
          message: 'Only lawyers can generate secure links'
        });
        return;
      }

      const mode: "existing_client" | "non_customer" = isNonCustomerMode ? "non_customer" : "existing_client";
      let client: any = null;
      if (mode === "existing_client") {
        client = await User.findById(client_id);
        if (!client) {
          res.status(404).json({
            success: false,
            message: 'Client not found'
          });
          return;
        }
      }

      // Keep active-link uniqueness per lawyer+mode+target.
      const existingLinkQuery: any = {
        lawyer_id,
        mode,
        expires_at: { $gt: new Date() }
      };
      if (mode === "existing_client") {
        existingLinkQuery.client_id = client_id;
      } else {
        existingLinkQuery.client_id = null;
      }
      const existingLink = await SecureLink.findOne(existingLinkQuery);

      if (existingLink) {
        res.status(400).json({
          success: false,
          message: 'An active secure link already exists',
          data: {
            link_id: existingLink._id,
            existing_link: existingLink.generateSecureUrl(),
            expires_at: existingLink.expires_at,
            mode: existingLink.mode,
          }
        });
        return;
      }

      // Create secure link
      const secureLink = await SecureLink.createSecureLink(
        new mongoose.Types.ObjectId(lawyer_id),
        mode,
        password,
        expires_in_hours,
        mode === "existing_client" ? new mongoose.Types.ObjectId(client_id) : null
      );

      console.log("[audit] secure-link generated", {
        link_id: secureLink._id.toString(),
        created_by: lawyer_id,
        mode: secureLink.mode,
        client_id: secureLink.client_id?.toString?.() || null,
      });

      res.status(201).json({
        success: true,
        message: 'Secure upload link generated successfully',
        data: {
          link_id: secureLink._id,
          secure_url: secureLink.generateSecureUrl(),
          expires_at: secureLink.expires_at,
          status: SecureLinkController.getStatus(secureLink.expires_at),
          client_name: mode === "existing_client" ? `${client.first_name} ${client.last_name}` : "Non-Customer User",
          client_email: mode === "existing_client" ? client.email : null,
          mode: secureLink.mode,
        }
      });

    } catch (error: any) {
      console.error('Generate secure link error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate secure link',
        error: error.message
      });
    }
  }

  /**
   * Validate secure link and get link details
   * GET /api/v1/secure-link/validate/:token
   */
  static async validateSecureLink(req: Request, res: Response): Promise<void> {
    try {
      const { token } = req.params;

      if (!token) {
        res.status(400).json({
          success: false,
          message: 'Link token is required'
        });
        return;
      }

      const secureLink = await SecureLink.validateLinkToken(token);

      if (!secureLink) {
        res.status(404).json({
          success: false,
          message: 'Invalid link'
        });
        return;
      }

      if (SecureLinkController.isExpired(secureLink.expires_at)) {
        res.status(410).json({
          success: false,
          message: "Secure link has expired",
        });
        return;
      }

      const authUser = await SecureLinkController.getOptionalAuthUser(req);
      const requiresSignup = secureLink.mode === "non_customer" && !authUser;
      const clientLabel = SecureLinkController.getClientLabel(secureLink);

      res.status(200).json({
        success: true,
        message: 'Link is valid',
        data: {
          link_id: secureLink._id,
          lawyer_name: `${(secureLink.lawyer_id as any).first_name} ${(secureLink.lawyer_id as any).last_name}`,
          client_name: clientLabel.client_name,
          client_email: clientLabel.client_email,
          status: SecureLinkController.getStatus(secureLink.expires_at),
          expires_at: secureLink.expires_at,
          created_at: secureLink.created_at,
          mode: secureLink.mode,
          requires_signup: requiresSignup,
        }
      });

    } catch (error: any) {
      console.error('Validate secure link error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to validate link',
        error: error.message
      });
    }
  }

  /**
   * Authenticate with password and get upload permissions
   * POST /api/v1/secure-link/authenticate
   */
  static async authenticateSecureLink(req: Request, res: Response): Promise<void> {
    try {
      const { token, password } = req.body;

      if (!token || !password) {
        res.status(400).json({
          success: false,
          message: 'Token and password are required'
        });
        return;
      }

      if (SecureLinkController.isAuthRateLimited(req, token)) {
        res.status(429).json({
          success: false,
          message: "Too many authentication attempts. Please try again later.",
        });
        return;
      }

      const secureLink = await SecureLink.validateLinkToken(token);

      if (!secureLink) {
        res.status(404).json({
          success: false,
          message: 'Invalid link'
        });
        return;
      }

      if (SecureLinkController.isExpired(secureLink.expires_at)) {
        res.status(410).json({
          success: false,
          message: "Secure link has expired",
        });
        return;
      }

      // Validate password
      const isPasswordValid = await secureLink.validatePassword(password);

      if (!isPasswordValid) {
        SecureLinkController.recordAuthFailure(req, token);
        console.log("[audit] secure-link auth blocked", {
          reason: "incorrect_password",
          link_id: secureLink._id.toString(),
          mode: secureLink.mode,
          ip: req.ip || null,
        });
        res.status(401).json({
          success: false,
          message: 'Incorrect password'
        });
        return;
      }

      const authUser = await SecureLinkController.getOptionalAuthUser(req);
      if (secureLink.mode === "non_customer" && !authUser) {
        SecureLinkController.recordAuthFailure(req, token);
        console.log("[audit] secure-link auth blocked", {
          reason: "signup_or_login_required",
          link_id: secureLink._id.toString(),
          mode: secureLink.mode,
          ip: req.ip || null,
        });
        res.status(401).json({
          success: false,
          message: "Signup/login required for non-customer secure link",
        });
        return;
      }
      SecureLinkController.clearAuthFailures(req, token);

      // Generate temporary upload token (valid for 1 hour)
      const jwtSecret = await getJwtSecret();
      const uploadToken = jwt.sign(
        {
          link_id: secureLink._id,
          lawyer_id: secureLink.lawyer_id,
          client_id: secureLink.client_id || null,
          mode: secureLink.mode,
          authenticated_user_id: authUser?.userId || secureLink.client_id?.toString?.() || null,
          type: 'secure_upload_auth',
          expires_at: secureLink.expires_at
        },
        jwtSecret,
        { expiresIn: '1h' }
      );

      const clientLabel = SecureLinkController.getClientLabel(secureLink);
      res.status(200).json({
        success: true,
        message: 'Authentication successful',
        data: {
          upload_token: uploadToken,
          lawyer_name: `${(secureLink.lawyer_id as any).first_name} ${(secureLink.lawyer_id as any).last_name}`,
          client_name: clientLabel.client_name,
          expires_at: secureLink.expires_at,
          mode: secureLink.mode,
        }
      });

    } catch (error: any) {
      console.error('Authenticate secure link error:', error);
      res.status(500).json({
        success: false,
        message: 'Authentication failed',
        error: error.message
      });
    }
  }

  /**
   * Upload document through secure link
   * POST /api/v1/secure-link/upload
   */
  static async uploadThroughSecureLink(req: Request, res: Response): Promise<void> {
    try {
      const { upload_token, file_url, file_name, file_size, file_base64 } = req.body;

      if (!upload_token || !file_url || !file_name) {
        res.status(400).json({
          success: false,
          message: 'Upload token, file URL, and file name are required'
        });
        return;
      }

      // Verify upload token
      let decoded: any;
      try {
        const jwtSecret = await getJwtSecret();
        decoded = jwt.verify(upload_token, jwtSecret);
      } catch (error) {
        res.status(401).json({
          success: false,
          message: 'Invalid or expired upload token'
        });
        return;
      }

      if (decoded.type !== 'secure_upload_auth') {
        res.status(401).json({
          success: false,
          message: 'Invalid token type'
        });
        return;
      }

      // Get the secure link
      const secureLink = await SecureLink.findById(decoded.link_id);
      if (!secureLink) {
        res.status(404).json({
          success: false,
          message: 'Link not found'
        });
        return;
      }

      // Enforce expiry on every upload. Link remains active for multiple uploads until expiry.
      if (SecureLinkController.isExpired(secureLink.expires_at)) {
        res.status(410).json({
          success: false,
          message: 'Secure link has expired'
        });
        return;
      }

      if (secureLink.mode !== decoded.mode) {
        console.log("[audit] secure-link upload blocked", {
          reason: "mode_mismatch",
          link_id: secureLink._id.toString(),
          decoded_mode: decoded.mode,
          mode: secureLink.mode,
        });
        res.status(401).json({ success: false, message: "Invalid upload token context" });
        return;
      }

      const authUser = await SecureLinkController.getOptionalAuthUser(req);
      if (secureLink.mode === "non_customer") {
        if (!authUser) {
          console.log("[audit] secure-link upload blocked", {
            reason: "auth_required_non_customer",
            link_id: secureLink._id.toString(),
          });
          res.status(401).json({
            success: false,
            message: "Authentication required for non-customer upload",
          });
          return;
        }
        if (decoded.authenticated_user_id !== authUser.userId) {
          console.log("[audit] secure-link upload blocked", {
            reason: "authenticated_user_mismatch",
            link_id: secureLink._id.toString(),
            decoded_user: decoded.authenticated_user_id || null,
            request_user: authUser.userId,
          });
          res.status(403).json({
            success: false,
            message: "Upload token does not match authenticated user",
          });
          return;
        }
      }

      const uploadOwnerId =
        secureLink.mode === "non_customer"
          ? decoded.authenticated_user_id
          : decoded.client_id;
      if (!uploadOwnerId || !mongoose.Types.ObjectId.isValid(String(uploadOwnerId))) {
        console.log("[audit] secure-link upload blocked", {
          reason: "invalid_upload_owner",
          link_id: secureLink._id.toString(),
          uploadOwnerId: uploadOwnerId || null,
        });
        res.status(400).json({
          success: false,
          message: "Invalid upload context",
        });
        return;
      }

      // Create document record using existing schema
      const document = new UserDocument({
        document_name: file_name,
        uploaded_by: new mongoose.Types.ObjectId(uploadOwnerId),
        link: file_url,
        file_base64: file_base64 ? compressBase64(file_base64) : undefined,
        file_size: file_size || 0,
        file_type: file_name.split('.').pop()?.toLowerCase() || 'unknown',
        status: 'Completed',
        privacy: 'private', // Private document
        shared_with: [new mongoose.Types.ObjectId(decoded.lawyer_id)], // Automatically shared with the lawyer who generated the link
        summary:
          secureLink.mode === "non_customer"
            ? "Document uploaded via non-customer secure link"
            : `Document uploaded via secure link from ${(secureLink.client_id as any)?.first_name || ''} ${(secureLink.client_id as any)?.last_name || ''}`.trim()
      });

      const savedDocument = await document.save();

      // Persist upload event (one-to-many: secure_link -> uploads)
      const upload = await SecureLinkUpload.create({
        link_id: secureLink._id,
        document_id: savedDocument._id,
        file_url,
        file_name,
        file_size: file_size || 0,
      });

      // Keep backward compatibility field updated, but do not use it to block uploads.
      if (!secureLink.is_used) {
        secureLink.is_used = true;
      }
      secureLink.used_at = new Date();
      secureLink.uploaded_document_id = savedDocument._id;
      await secureLink.save();

      const uploadCount = await SecureLinkUpload.countDocuments({ link_id: secureLink._id });
      console.log("[audit] secure-link upload", {
        link_id: secureLink._id.toString(),
        upload_id: upload._id.toString(),
        client_id: decoded.client_id || null,
        uploader_user_id: uploadOwnerId,
        lawyer_id: decoded.lawyer_id,
        mode: secureLink.mode,
        uploaded_at: upload.uploaded_at,
      });

      res.status(201).json({
        success: true,
        data: {
          link_id: secureLink._id,
          upload_id: upload._id,
          upload_count: uploadCount,
          expires_at: secureLink.expires_at
        }
      });

    } catch (error: any) {
      console.error('Secure upload error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to upload document',
        error: error.message
      });
    }
  }

  /**
   * Get secure links created by a lawyer
   * GET /api/v1/secure-link/my-links
   */
  static async getMySecureLinks(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const lawyer_id = req.user?.userId;
      const { page = 1, limit = 10, status = 'all' } = req.query;

      if (!lawyer_id) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      // Build query
      let query: any = { lawyer_id };
      
      if (status === 'active') {
        query.expires_at = { $gt: new Date() };
      } else if (status === 'expired') {
        query.expires_at = { $lte: new Date() };
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [links, total] = await Promise.all([
        SecureLink.find(query)
          .populate('client_id', 'first_name last_name email')
          .sort({ created_at: -1 })
          .skip(skip)
          .limit(Number(limit)),
        SecureLink.countDocuments(query)
      ]);

      const linkIds = links.map((link: any) => link._id);
      const uploadAgg = await SecureLinkUpload.aggregate([
        { $match: { link_id: { $in: linkIds } } },
        {
          $group: {
            _id: "$link_id",
            upload_count: { $sum: 1 },
            latest_upload_at: { $max: "$uploaded_at" },
          }
        }
      ]);
      const uploadMap = new Map(
        uploadAgg.map((row: any) => [row._id.toString(), row])
      );

      res.status(200).json({
        success: true,
        message: 'Secure links retrieved successfully',
        data: {
          links: links.map(link => ({
            ...(() => {
              const label = SecureLinkController.getClientLabel(link);
              return {
                client_name: label.client_name,
                client_email: label.client_email,
              };
            })(),
            link_id: link._id,
            secure_url: link.generateSecureUrl(),
            created_at: link.created_at,
            expires_at: link.expires_at,
            status: SecureLinkController.getStatus(link.expires_at),
            mode: (link as any).mode || "existing_client",
            upload_count: uploadMap.get((link as any)._id.toString())?.upload_count || 0,
            latest_upload_at: uploadMap.get((link as any)._id.toString())?.latest_upload_at || null,
            // Backward compatible fields
            is_used: link.is_used,
            used_at: link.used_at,
          })),
          pagination: {
            current_page: Number(page),
            total_pages: Math.ceil(total / Number(limit)),
            total_links: total,
            has_next: skip + Number(limit) < total,
            has_prev: Number(page) > 1
          }
        }
      });

    } catch (error: any) {
      console.error('Get secure links error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve secure links',
        error: error.message
      });
    }
  }

  /**
   * Update password for an existing secure link (active only)
   * PATCH /api/v1/secure-link/:id/password
   * Body: { password: string }
   */
  static async updateSecureLinkPassword(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const lawyer_id = req.user?.userId;
      const { id } = req.params;
      const { password } = req.body as { password?: string };

      if (!lawyer_id) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        res.status(400).json({ success: false, message: 'Invalid link id' });
        return;
      }

      if (!password || typeof password !== 'string' || password.trim().length < 6) {
        res.status(400).json({
          success: false,
          message: 'Password must be at least 6 characters long',
        });
        return;
      }

      const lawyer = await User.findById(lawyer_id).select('account_type').lean();
      if (!lawyer || (lawyer as any).account_type !== 'lawyer') {
        res.status(403).json({ success: false, message: 'Only lawyers can update secure links' });
        return;
      }

      const secureLink = await SecureLink.findById(id).populate('client_id', 'first_name last_name email');
      if (!secureLink) {
        res.status(404).json({ success: false, message: 'Secure link not found' });
        return;
      }

      if ((secureLink.created_by?.toString?.() || secureLink.lawyer_id.toString()) !== lawyer_id) {
        res.status(403).json({ success: false, message: 'Forbidden' });
        return;
      }

      if (SecureLinkController.isExpired(secureLink.expires_at)) {
        res.status(400).json({ success: false, message: 'Cannot edit password for an expired link' });
        return;
      }

      const saltRounds = 12;
      secureLink.password_hash = await bcrypt.hash(password.trim(), saltRounds);
      await secureLink.save();

      const label = SecureLinkController.getClientLabel(secureLink);
      res.status(200).json({
        success: true,
        message: 'Secure link password updated successfully',
        data: {
          link_id: secureLink._id,
          client_name: label.client_name,
          client_email: label.client_email,
          secure_url: secureLink.generateSecureUrl(),
          expires_at: secureLink.expires_at,
          status: SecureLinkController.getStatus(secureLink.expires_at),
          mode: (secureLink as any).mode || "existing_client",
        },
      });
    } catch (error: any) {
      console.error('Update secure link password error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update secure link password',
        error: error.message,
      });
    }
  }
}

export default SecureLinkController;
