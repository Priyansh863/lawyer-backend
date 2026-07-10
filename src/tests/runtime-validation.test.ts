import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import AdminDocumentPermissionController from "../controllers/AdminDocumentPermissionController";
import DocumentController from "../controllers/DocumentController";
import UserDocument from "../models/user_documents";
import DocumentPermission from "../models/DocumentPermission";
import DocumentPermissionAuditLog from "../models/DocumentPermissionAuditLog";
import { User } from "../models/user";
import { requireAdmin, authenticateToken } from "../middleware/auth";
import { setEncryptionKey } from "../utils/mongooseEncryption";

// Initialize encryption key for testing
setEncryptionKey("test-crypto-key-for-runtime-validation-12345");

function createMockResponse() {
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
    send(payload: any) {
      this.body = payload;
      return this;
    }
  };
  return res;
}

test("Runtime Validation: Auth and Admin restrictions", async () => {
  // 1. Unauthenticated admin API -> 401
  const reqUnauth = {
    headers: {}
  } as any;
  const resUnauth = createMockResponse();
  let nextCalled = false;
  await authenticateToken(reqUnauth, resUnauth, () => { nextCalled = true; });
  assert.equal(resUnauth.statusCode, 401);
  assert.equal(nextCalled, false);

  // 2. Authenticated non-admin admin API -> 403
  const reqNonAdmin = {
    id: "507f1f77bcf86cd799439011",
    role: "lawyer",
    user: { userId: "507f1f77bcf86cd799439011", role: "lawyer" }
  } as any;
  const originalFindById = User.findById;
  (User as any).findById = () => ({
    select: () => ({
      lean: async () => ({ account_type: "lawyer" })
    })
  });

  const resNonAdmin = createMockResponse();
  nextCalled = false;
  await requireAdmin(reqNonAdmin, resNonAdmin, () => { nextCalled = true; });
  assert.equal(resNonAdmin.statusCode, 403);
  assert.equal(nextCalled, false);

  // Restore User model mock
  User.findById = originalFindById;

  // 3. Admin API -> 200 (allow next() to be called)
  const reqAdmin = {
    id: "507f1f77bcf86cd799439013",
    role: "admin",
    user: { userId: "507f1f77bcf86cd799439013", role: "admin" }
  } as any;
  const resAdmin = createMockResponse();
  nextCalled = false;
  await requireAdmin(reqAdmin, resAdmin, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test("Runtime Validation: Document permission flows (Grant, Revoke, Block)", async () => {
  const originalFindById = UserDocument.findById;
  const originalExists = DocumentPermission.exists;
  const originalUpdateOne = DocumentPermission.updateOne;
  const originalAuditLog = DocumentPermissionAuditLog.create;

  const mockDoc = {
    _id: new mongoose.Types.ObjectId("507f1f77bcf86cd799439014"),
    document_name: "confidential_file.pdf",
    uploaded_by: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011"),
    shared_with: [],
    privacy: "private",
    privacy_level: "PRIVATE_SHARED",
    file_base64: "data:application/pdf;base64,dGVzdCBjb250ZW50", // base64 for "test content"
    file_type: "pdf"
  };

  let activePermissionMock = false;
  let revokedPermissionMock = false;

  (UserDocument as any).findById = () => {
    const chain = {
      populate() { return chain; },
      then(onfulfilled: any) {
        return Promise.resolve(mockDoc).then(onfulfilled);
      }
    };
    return chain as any;
  };
  (DocumentPermission as any).exists = async (query: any) => {
    if (query.revoked_at && query.revoked_at.$ne === null) {
      return revokedPermissionMock;
    }
    if (query.revoked_at === null) {
      return activePermissionMock;
    }
    return false;
  };
  (DocumentPermission as any).updateOne = async () => ({ modifiedCount: 1 });
  (DocumentPermissionAuditLog as any).create = async () => ({});

  try {
    // 4. Access check before grant -> false (access denied)
    const req1 = { params: { id: "507f1f77bcf86cd799439014" }, id: "507f1f77bcf86cd799439012", role: "client" } as any;
    const res1 = createMockResponse();
    await DocumentController.viewDocument(req1, res1);
    assert.equal(res1.statusCode, 403); // Denied

    // 5. Access check after grant -> true
    activePermissionMock = true;
    revokedPermissionMock = false;
    const res2 = createMockResponse();
    await DocumentController.viewDocument(req1, res2);
    assert.equal(res2.statusCode, 200); // Success!
    assert.equal(res2.body.success, true);
    assert.ok(res2.body.viewUrl); // View URL retrieved

    // 6. Access check after revoke -> false (blocked)
    activePermissionMock = false;
    revokedPermissionMock = true;

    // View blocked
    const resView = createMockResponse();
    await DocumentController.viewDocument(req1, resView);
    assert.equal(resView.statusCode, 403);

    // Download blocked
    const resDownload = createMockResponse();
    await DocumentController.downloadDocument(req1, resDownload);
    assert.equal(resDownload.statusCode, 403);

    // Secure link generation blocked
    const reqSecure = { body: { documentId: "507f1f77bcf86cd799439014" }, id: "507f1f77bcf86cd799439012", role: "client" } as any;
    const resSecure = createMockResponse();
    await DocumentController.generateSecureLink(reqSecure, resSecure);
    assert.equal(resSecure.statusCode, 403);

  } finally {
    UserDocument.findById = originalFindById;
    DocumentPermission.exists = originalExists;
    DocumentPermission.updateOne = originalUpdateOne;
    (DocumentPermissionAuditLog as any).create = originalAuditLog;
  }
});
