import { Request, Response } from 'express';
import mongoose from 'mongoose';
import SecureLink from '../models/SecureLink';
import { User } from '../models/user';
import UserDocument from '../models/user_documents';

// Define AuthenticatedRequest interface
interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

class SecureLinkController {
  /**
   * Generate a secure upload link for a client
   * POST /api/v1/secure-link/generate
   */
  static async generateSecureLink(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const { client_id, password, expires_in_hours = 24 } = req.body;
      const lawyer_id = req.user?.userId;

      // Validation
      if (!lawyer_id) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
        return;
      }

      if (!client_id || !password) {
        res.status(400).json({
          success: false,
          message: 'Client ID and password are required'
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

      // Verify client exists
      const client = await User.findById(client_id);
      if (!client) {
        res.status(404).json({
          success: false,
          message: 'Client not found'
        });
        return;
      }

      // Check for existing active links for this client-lawyer pair
      const existingLink = await SecureLink.findOne({
        lawyer_id,
        client_id,
        is_used: false,
        expires_at: { $gt: new Date() }
      });

      if (existingLink) {
        res.status(400).json({
          success: false,
          message: 'An active secure link already exists for this client',
          data: {
            existing_link: existingLink.generateSecureUrl(),
            expires_at: existingLink.expires_at
          }
        });
        return;
      }

      // Create secure link
      const secureLink = await SecureLink.createSecureLink(
        new mongoose.Types.ObjectId(lawyer_id),
        new mongoose.Types.ObjectId(client_id),
        password,
        expires_in_hours
      );

      res.status(201).json({
        success: true,
        message: 'Secure upload link generated successfully',
        data: {
          link_id: secureLink._id,
          secure_url: secureLink.generateSecureUrl(),
          expires_at: secureLink.expires_at,
          client_name: `${client.first_name} ${client.last_name}`,
          client_email: client.email
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
          message: 'Invalid, expired, or already used link'
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: 'Link is valid',
        data: {
          link_id: secureLink._id,
          lawyer_name: `${(secureLink.lawyer_id as any).first_name} ${(secureLink.lawyer_id as any).last_name}`,
          client_name: `${(secureLink.client_id as any).first_name} ${(secureLink.client_id as any).last_name}`,
          expires_at: secureLink.expires_at,
          created_at: secureLink.created_at
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

      const secureLink = await SecureLink.validateLinkToken(token);

      if (!secureLink) {
        res.status(404).json({
          success: false,
          message: 'Invalid, expired, or already used link'
        });
        return;
      }

      // Validate password
      const isPasswordValid = await secureLink.validatePassword(password);

      if (!isPasswordValid) {
        res.status(401).json({
          success: false,
          message: 'Invalid password'
        });
        return;
      }

      // Generate temporary upload token (valid for 1 hour)
      const uploadToken = require('jsonwebtoken').sign(
        {
          link_id: secureLink._id,
          lawyer_id: secureLink.lawyer_id,
          client_id: secureLink.client_id,
          type: 'secure_upload_auth'
        },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '1h' }
      );

      res.status(200).json({
        success: true,
        message: 'Authentication successful',
        data: {
          upload_token: uploadToken,
          lawyer_name: `${(secureLink.lawyer_id as any).first_name} ${(secureLink.lawyer_id as any).last_name}`,
          client_name: `${(secureLink.client_id as any).first_name} ${(secureLink.client_id as any).last_name}`,
          expires_at: secureLink.expires_at
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
      const jwt = require('jsonwebtoken');
      let decoded: any;
      try {
        decoded = jwt.verify(upload_token, process.env.JWT_SECRET || 'your-secret-key');
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
      if (!secureLink || secureLink.is_used) {
        res.status(404).json({
          success: false,
          message: 'Link not found or already used'
        });
        return;
      }

      // Create document record using existing schema
      const document = new UserDocument({
        document_name: file_name,
        uploaded_by: new mongoose.Types.ObjectId(decoded.client_id),
        link: file_url,
        file_base64,
        file_size: file_size || 0,
        file_type: file_name.split('.').pop()?.toLowerCase() || 'unknown',
        status: 'Completed',
        privacy: 'private', // Private document
        shared_with: [new mongoose.Types.ObjectId(decoded.lawyer_id)], // Automatically shared with the lawyer who generated the link
        summary: `Document uploaded via secure link from ${(secureLink.client_id as any).first_name} ${(secureLink.client_id as any).last_name}`
      });

      const savedDocument = await document.save();

      // Mark secure link as used
      await secureLink.markAsUsed(savedDocument._id);

      res.status(201).json({
        success: true,
        message: 'Document uploaded successfully through secure link',
        data: {
          document_id: savedDocument._id,
          document_name: savedDocument.document_name,
          upload_date: savedDocument.created_at || new Date(),
          shared_with_lawyer: true,
          link_expired: true
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
        query.is_used = false;
        query.expires_at = { $gt: new Date() };
      } else if (status === 'used') {
        query.is_used = true;
      } else if (status === 'expired') {
        query.is_used = false;
        query.expires_at = { $lte: new Date() };
      }

      const skip = (Number(page) - 1) * Number(limit);

      const [links, total] = await Promise.all([
        SecureLink.find(query)
          .populate('client_id', 'first_name last_name email')
          .populate('uploaded_document_id', 'file_name upload_date')
          .sort({ created_at: -1 })
          .skip(skip)
          .limit(Number(limit)),
        SecureLink.countDocuments(query)
      ]);

      res.status(200).json({
        success: true,
        message: 'Secure links retrieved successfully',
        data: {
          links: links.map(link => ({
            link_id: link._id,
            client_name: `${(link.client_id as any).first_name} ${(link.client_id as any).last_name}`,
            client_email: (link.client_id as any).email,
            secure_url: link.generateSecureUrl(),
            is_used: link.is_used,
            created_at: link.created_at,
            expires_at: link.expires_at,
            used_at: link.used_at,
            uploaded_document: link.uploaded_document_id ? {
              file_name: (link.uploaded_document_id as any).file_name,
              upload_date: (link.uploaded_document_id as any).upload_date
            } : null
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
}

export default SecureLinkController;
