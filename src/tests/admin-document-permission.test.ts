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
