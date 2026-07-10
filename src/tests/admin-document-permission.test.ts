import test from "node:test";
import assert from "node:assert/strict";
import { NextFunction, Response } from "express";
import {
  AuthenticatedRequest,
  requireAdmin,
  resolveAdminAccess,
} from "../middleware/auth";
import { User } from "../models/user";

test("resolveAdminAccess returns unauthorized when userId is missing", async () => {
  const result = await resolveAdminAccess(undefined, "lawyer");
  assert.equal(result, "unauthorized");
});

test("resolveAdminAccess allows admin role from token", async () => {
  const result = await resolveAdminAccess("user-1", "admin");
  assert.equal(result, "ok");
});

test("resolveAdminAccess allows Admin role with legacy casing", async () => {
  const result = await resolveAdminAccess("user-1", "Admin");
  assert.equal(result, "ok");
});

test("resolveAdminAccess blocks non-admin role without DB admin account", async () => {
  const result = await resolveAdminAccess("user-2", "lawyer", async () => "lawyer");
  assert.equal(result, "forbidden");
});

test("resolveAdminAccess allows DB admin account when token role is missing", async () => {
  const result = await resolveAdminAccess("user-3", undefined, async () => "admin");
  assert.equal(result, "ok");
});

test("requireAdmin responds 401 when request has no authenticated user", async () => {
  const req = {} as AuthenticatedRequest;
  const res = createMockResponse();
  let nextCalled = false;

  await requireAdmin(req, res as unknown as Response, (() => {
    nextCalled = true;
  }) as NextFunction);

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body?.success, false);
});

test("requireAdmin responds 403 for authenticated non-admin users", async () => {
  const req = {
    id: "lawyer-1",
    role: "lawyer",
    user: { userId: "lawyer-1", role: "lawyer" },
  } as unknown as AuthenticatedRequest;

  const originalFindById = User.findById;
  (User as any).findById = () => ({
    select: () => ({
      lean: async () => ({ account_type: "lawyer" }),
    }),
  });

  const res = createMockResponse();
  let nextCalled = false;

  try {
    await requireAdmin(req, res as unknown as Response, (() => {
      nextCalled = true;
    }) as NextFunction);
  } finally {
    (User as any).findById = originalFindById;
  }

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.match(res.body?.message || "", /admin access required/i);
});

test("requireAdmin calls next for admin users", async () => {
  const req = {
    id: "admin-1",
    role: "admin",
    user: { userId: "admin-1", role: "admin" },
  } as unknown as AuthenticatedRequest;

  const res = createMockResponse();
  let nextCalled = false;

  await requireAdmin(req, res as unknown as Response, (() => {
    nextCalled = true;
  }) as NextFunction);

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

type MockResponse = {
  statusCode: number;
  body: any;
  status: (code: number) => MockResponse;
  json: (payload: any) => MockResponse;
};

function createMockResponse(): MockResponse {
  const res: MockResponse = {
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
  };
  return res;
}

import AdminDocumentPermissionController from "../controllers/AdminDocumentPermissionController";
import DocumentPermission from "../models/DocumentPermission";
import DocumentPermissionAuditLog from "../models/DocumentPermissionAuditLog";
import UserDocument from "../models/user_documents";

test("Public -> Private transition test revokes hidden permissions", async () => {
  const originalFindById = UserDocument.findById;
  const originalFindByIdAndUpdate = UserDocument.findByIdAndUpdate;
  const originalUpdateMany = DocumentPermission.updateMany;
  const originalAuditLog = DocumentPermissionAuditLog.create;

  let updateManyCalledWith: any = null;
  let findByIdAndUpdatePayload: any = null;

  try {
    (UserDocument as any).findById = async () => ({
      _id: "doc-123",
      document_name: "test doc",
      uploaded_by: "owner-1",
      privacy: "private",
      privacy_level: "PRIVATE_SHARED"
    });

    (UserDocument as any).findByIdAndUpdate = async (id: string, payload: any) => {
      findByIdAndUpdatePayload = payload;
      return {
        _id: id,
        document_name: "test doc",
        uploaded_by: "owner-1",
        privacy_level: payload.privacy_level
      };
    };

    (DocumentPermission as any).updateMany = async (query: any, update: any) => {
      updateManyCalledWith = { query, update };
      return { modifiedCount: 1 };
    };

    (DocumentPermissionAuditLog as any).create = async () => {
      return {};
    };

    const req = {
      params: { id: "doc-123" },
      body: { privacyLevel: "PUBLIC" },
      id: "admin-1",
      role: "admin"
    } as any;

    const res = createMockResponse();

    await AdminDocumentPermissionController.updatePrivacy(req, res as any);

    assert.equal(res.statusCode, 200);
    assert.ok(findByIdAndUpdatePayload);
    assert.deepEqual(findByIdAndUpdatePayload.shared_with, []);
    assert.equal(findByIdAndUpdatePayload.privacy, "public");

    assert.ok(updateManyCalledWith);
    assert.equal(updateManyCalledWith.query.document_id, "doc-123");
    assert.equal(updateManyCalledWith.query.revoked_at, null);
    assert.ok(updateManyCalledWith.update.$set.revoked_at);
    assert.equal(updateManyCalledWith.update.$set.revoked_by, "admin-1");
  } finally {
    UserDocument.findById = originalFindById;
    UserDocument.findByIdAndUpdate = originalFindByIdAndUpdate;
    DocumentPermission.updateMany = originalUpdateMany;
    (DocumentPermissionAuditLog as any).create = originalAuditLog;
  }
});
