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

import * as FileUpload from "../utils/fileUpload";
import UserController from "../controllers/UserController";
import UserService from "../services/UserService";
import Helper from "../utils/helper";

test("Runtime Validation: Presigned URL Fail-Closed and Namespace Restriction", async () => {
  // 1. getShortLivedPresignedGetUrl returns null (fail-closed) on unrecognized/invalid URL
  const nullUrl = await FileUpload.getShortLivedPresignedGetUrl("http://unauthorized-external-link.com/file.pdf");
  assert.equal(nullUrl, null);

  // 2. Presigned upload endpoint enforces user ID namespace on filePath
  const originalGettingPreSignedUrl = Helper.gettingPreSignedUrl;
  let receivedS3Key: string | null = null;
  (Helper as any).gettingPreSignedUrl = async (key: string, format: any) => {
    receivedS3Key = key;
    return "https://mock-s3-url.com/" + key;
  };

  try {
    // Valid namespace input still results in a server-side key inside the user namespace
    const req1 = {
      body: { filePath: "temp/507f1f77bcf86cd799439013/my_doc.pdf", fileFormat: "application/pdf" },
      id: "507f1f77bcf86cd799439013",
      role: "client"
    } as any;
    const res1 = createMockResponse();
    await UserController.getPresignedUrl(req1, res1);
    assert.equal(res1.statusCode, 200);
    assert.ok(receivedS3Key);
    assert.ok(receivedS3Key.startsWith("uploads/507f1f77bcf86cd799439013/"));

    // Invalid namespace path -> gets rewritten to a safe key inside the user's namespace prefix
    const req2 = {
      body: { filePath: "some_arbitrary/path/leak.pdf", fileFormat: "application/pdf" },
      id: "507f1f77bcf86cd799439013",
      role: "client"
    } as any;
    const res2 = createMockResponse();
    await UserController.getPresignedUrl(req2, res2);
    assert.equal(res2.statusCode, 200);
    assert.ok(receivedS3Key);
    assert.ok(receivedS3Key.startsWith("uploads/507f1f77bcf86cd799439013/"));
  } finally {
    Helper.gettingPreSignedUrl = originalGettingPreSignedUrl;
  }
});

test("Runtime Validation: Document upload rejects external direct URLs", async () => {
  const req = {
    body: {
      fileUrl: "https://example.com/external.pdf",
      fileName: "external.pdf",
      privacy: "private"
    },
    id: "507f1f77bcf86cd799439013",
    role: "client"
  } as any;
  const res = createMockResponse();
  await DocumentController.uploadDocument(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body?.message, "No valid file content provided. Supply base64 file data or a valid platform S3 URL.");
});

test("Runtime Validation: uploadDocumentWithAI creates initial permission and audit records", async () => {
  const originalStartSession = mongoose.startSession;
  const originalUserDocumentCreate = UserDocument.create;
  const originalPermCreate = DocumentPermission.create;
  const originalAuditCreate = DocumentPermissionAuditLog.create;
  const originalUserFindById = (User as any).findById;
  const originalRoundTrip = FileUpload.roundTripBase64ViaS3ToStoredBase64;
  const originalIngest = FileUpload.ingestS3UploadToStoredBase64;

  let permissionDocs: any = null;
  let auditDocs: any = null;

  (mongoose as any).startSession = async () => ({
    startTransaction() {},
    commitTransaction: async () => {},
    abortTransaction: async () => {},
    endSession() {}
  });

  (User as any).findById = async () => ({ _id: "507f1f77bcf86cd799439013" } as any);
  (UserDocument as any).create = async (docs: any[]) => [{ _id: "uploaded-doc-1", ...docs[0] }];
  (DocumentPermission as any).create = async (docs: any[], opts: any) => { permissionDocs = docs; return docs; };
  (DocumentPermissionAuditLog as any).create = async (docs: any[], opts: any) => { auditDocs = docs; return docs; };
  (FileUpload as any).roundTripBase64ViaS3ToStoredBase64 = async () => ({ file_base64: "data:text/plain;base64,aGVsbG8=", link: null });
  (FileUpload as any).ingestS3UploadToStoredBase64 = async () => null;

  try {
    const req = {
      body: {
        file_base64: "data:text/plain;base64,aGVsbG8=",
        fileName: "test.txt",
        selectedUsers: ["507f1f77bcf86cd799439014"],
        privacy: "private",
        processWithAI: false
      },
      id: "507f1f77bcf86cd799439013",
      role: "client"
    } as any;
    const res = createMockResponse();
    await DocumentController.uploadDocumentWithAI(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(permissionDocs?.length === 1);
    assert.equal(permissionDocs[0].document_id, "uploaded-doc-1");
    assert.ok(auditDocs?.length === 1);
    assert.equal(auditDocs[0].action, "GRANT");
  } finally {
    mongoose.startSession = originalStartSession;
    UserDocument.create = originalUserDocumentCreate;
    DocumentPermission.create = originalPermCreate;
    DocumentPermissionAuditLog.create = originalAuditCreate;
    User.findById = originalUserFindById;
    (FileUpload as any).roundTripBase64ViaS3ToStoredBase64 = originalRoundTrip;
    (FileUpload as any).ingestS3UploadToStoredBase64 = originalIngest;
  }
});

test("Runtime Validation: Sharing Details and Users List Scoping", async () => {
  const originalFindById = UserDocument.findById;
  const originalUserFind = User.find;
  const originalUserCount = User.countDocuments;

  const mockDoc = {
    _id: new mongoose.Types.ObjectId("507f1f77bcf86cd799439014"),
    document_name: "secure_doc.pdf",
    uploaded_by: new mongoose.Types.ObjectId("507f1f77bcf86cd799439011"), // owned by 507f1f77bcf86cd799439011
    shared_with: [],
    privacy: "private",
    privacy_level: "PRIVATE_SHARED"
  };

  (UserDocument as any).findById = () => {
    const chain = {
      populate() { return chain; },
      lean() { return Promise.resolve(mockDoc); },
      then(onfulfilled: any) {
        return Promise.resolve(mockDoc).then(onfulfilled);
      }
    };
    return chain as any;
  };

  (User as any).find = () => {
    const chain = {
      sort() { return chain; },
      skip() { return chain; },
      limit() { return chain; },
      lean() {
        return Promise.resolve([
          { _id: "507f1f77bcf86cd799439012", first_name: "Alice", last_name: "Smith", account_type: "client" }
        ]);
      }
    };
    return chain as any;
  };
  (User as any).countDocuments = async () => 1;

  try {
    // 1. Requester is NOT owner/admin -> getDocumentSharingDetails returns 403 Forbidden
    const reqNonOwner = {
      params: { documentId: "507f1f77bcf86cd799439014" },
      id: "507f1f77bcf86cd799439012", // user-2
      role: "client"
    } as any;
    const resNonOwner = createMockResponse();
    await DocumentController.getDocumentSharingDetails(reqNonOwner, resNonOwner);
    assert.equal(resNonOwner.statusCode, 403);

    // 2. Requester IS owner -> getDocumentSharingDetails returns 200 OK
    const reqOwner = {
      params: { documentId: "507f1f77bcf86cd799439014" },
      id: "507f1f77bcf86cd799439011", // owner
      role: "client"
    } as any;
    const resOwner = createMockResponse();
    await DocumentController.getDocumentSharingDetails(reqOwner, resOwner);
    assert.equal(resOwner.statusCode, 200);

    // 3. getUsersForSharing without documentId fails with 400
    const reqNoDocId = {
      body: {},
      id: "507f1f77bcf86cd799439011",
      role: "client"
    } as any;
    const resNoDocId = createMockResponse();
    await DocumentController.getUsersForSharing(reqNoDocId, resNoDocId);
    assert.equal(resNoDocId.statusCode, 400);

    // 4. getUsersForSharing for non-owned document fails with 403
    const reqGetUsersNonOwner = {
      body: { documentId: "507f1f77bcf86cd799439014" },
      id: "507f1f77bcf86cd799439012",
      role: "client"
    } as any;
    const resGetUsersNonOwner = createMockResponse();
    await DocumentController.getUsersForSharing(reqGetUsersNonOwner, resGetUsersNonOwner);
    assert.equal(resGetUsersNonOwner.statusCode, 403);

    // 5. getUsersForSharing for owned document succeeds with 200
    const reqGetUsersOwner = {
      body: { documentId: "507f1f77bcf86cd799439014" },
      id: "507f1f77bcf86cd799439011",
      role: "client"
    } as any;
    const resGetUsersOwner = createMockResponse();
    await DocumentController.getUsersForSharing(reqGetUsersOwner, resGetUsersOwner);
    assert.equal(resGetUsersOwner.statusCode, 200);
    assert.equal(resGetUsersOwner.body.success, true);
    assert.equal(resGetUsersOwner.body.data.users.length, 1);
  } finally {
    UserDocument.findById = originalFindById;
    User.find = originalUserFind;
    User.countDocuments = originalUserCount;
  }
});
