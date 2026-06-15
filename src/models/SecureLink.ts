import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../utils/jwtSecret';

export type SecureLinkMode = "existing_client" | "non_customer";

export interface ISecureLink extends Document {
  lawyer_id: mongoose.Types.ObjectId;
  created_by: mongoose.Types.ObjectId;
  client_id?: mongoose.Types.ObjectId | null;
  mode: SecureLinkMode;
  link_token: string;
  password_hash: string;
  is_used: boolean;
  expires_at: Date;
  created_at: Date;
  used_at?: Date;
  uploaded_document_id?: mongoose.Types.ObjectId;
  generateSecureUrl(): string;
  validatePassword(password: string): Promise<boolean>;
  markAsUsed(documentId: mongoose.Types.ObjectId): Promise<void>;
  isExpired(): boolean;
}

export interface ISecureLinkModel extends mongoose.Model<ISecureLink> {
  createSecureLink(
    lawyerId: mongoose.Types.ObjectId,
    mode: SecureLinkMode,
    password: string,
    expiresInHours?: number,
    clientId?: mongoose.Types.ObjectId | null,
  ): Promise<ISecureLink>;
  validateLinkToken(token: string): Promise<ISecureLink | null>;
}

const SecureLinkSchema = new Schema<ISecureLink>({
  lawyer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  client_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    default: null
  },
  mode: {
    type: String,
    enum: ['existing_client', 'non_customer'],
    required: true,
    default: 'existing_client'
  },
  link_token: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  password_hash: {
    type: String,
    required: true
  },
  is_used: {
    type: Boolean,
    default: false
  },
  expires_at: {
    type: Date,
    required: true,
    index: true
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  used_at: {
    type: Date
  },
  uploaded_document_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document'
  }
});

// Index for automatic cleanup of expired links
SecureLinkSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

// Instance Methods
SecureLinkSchema.methods.generateSecureUrl = function(): string {
  const baseUrl = process.env.FRONTEND_URL || 'https://lawgg.net';
  return `${baseUrl}/secure-upload/${this.link_token}`;
};

SecureLinkSchema.methods.validatePassword = async function(password: string): Promise<boolean> {
  return await bcrypt.compare(password, this.password_hash);
};

SecureLinkSchema.methods.markAsUsed = async function(documentId: mongoose.Types.ObjectId): Promise<void> {
  this.is_used = true;
  this.used_at = new Date();
  this.uploaded_document_id = documentId;
  await this.save();
};

SecureLinkSchema.methods.isExpired = function(): boolean {
  return new Date() >= this.expires_at;
};

// Static Methods
SecureLinkSchema.statics.createSecureLink = async function(
  lawyerId: mongoose.Types.ObjectId,
  mode: SecureLinkMode,
  password: string,
  expiresInHours: number = 24,
  clientId?: mongoose.Types.ObjectId | null,
): Promise<ISecureLink> {
  // Hash the password
  const saltRounds = 12;
  const password_hash = await bcrypt.hash(password, saltRounds);
  
  // Generate JWT token with embedded info
  const tokenPayload = {
    lawyerId: lawyerId.toString(),
    clientId: clientId ? clientId.toString() : null,
    mode,
    timestamp: Date.now(),
    type: 'secure_upload'
  };
  
  const jwtSecret = await getJwtSecret();
  const link_token = jwt.sign(tokenPayload, jwtSecret, {
    expiresIn: `${expiresInHours}h`,
    issuer: 'lawyer-app',
    subject: 'secure-document-upload'
  });
  
  // Set expiration date
  const expires_at = new Date();
  expires_at.setHours(expires_at.getHours() + expiresInHours);
  
  // Create the secure link
  const secureLink = new this({
    lawyer_id: lawyerId,
    created_by: lawyerId,
    client_id: clientId || null,
    mode,
    link_token,
    password_hash,
    expires_at
  });
  
  return await secureLink.save();
};

SecureLinkSchema.statics.validateLinkToken = async function(token: string): Promise<ISecureLink | null> {
  try {
    // Verify JWT signature and type, but let controller decide expiry semantics.
    const jwtSecret = await getJwtSecret();
    const decoded = jwt.verify(token, jwtSecret, { ignoreExpiration: true }) as any;
    
    // Check if token type is correct
    if (decoded.type !== 'secure_upload') {
      return null;
    }
    
    // Find the secure link in database
    const secureLink = await this.findOne({
      link_token: token
    }).populate('lawyer_id', 'first_name last_name email')
     .populate('client_id', 'first_name last_name email');
    
    return secureLink;
  } catch (error) {
    console.error('Token validation error:', error);
    return null;
  }
};

const SecureLink = mongoose.model<ISecureLink, ISecureLinkModel>('SecureLink', SecureLinkSchema);

export default SecureLink;
