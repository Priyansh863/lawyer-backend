import test from "node:test";
import assert from "node:assert/strict";
import DocumentController from "../controllers/DocumentController";
import UserDocument, { StorageType } from "../models/user_documents";

type MockRes = {
  statusCode: number;
  body: any;
  status: (code: number) => MockRes;
  json: (payload: any) => MockRes;
};

const createRes = (): MockRes => {
  const res: MockRes = {
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
};

test("owner success on DELETE /document/:id/cloud", async () => {
  const originalFindById = (UserDocument as any).findById;
  const originalFindByIdAndDelete = (UserDocument as any).findByIdAndDelete;

  try {
    (UserDocument as any).findById = async () => ({
      _id: "doc1",
      uploaded_by: { toString: () => "owner1" },
      shared_with: [],
      storage_type: StorageType.CLOUD,
    });
    (UserDocument as any).findByIdAndDelete = async () => ({ _id: "doc1" });

    const req: any = { params: { id: "doc1" }, id: "owner1" };
    const res = createRes();

    await DocumentController.removeFromCloud(req, res as any);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body?.success, true);
  } finally {
    (UserDocument as any).findById = originalFindById;
    (UserDocument as any).findByIdAndDelete = originalFindByIdAndDelete;
  }
});

test("unauthorized gets 403 on DELETE /document/:id/local", async () => {
  const originalFindById = (UserDocument as any).findById;

  try {
    (UserDocument as any).findById = async () => ({
      _id: "doc2",
      uploaded_by: { toString: () => "owner2" },
      shared_with: [],
      storage_type: StorageType.APP,
    });

    const req: any = { params: { id: "doc2" }, id: "intruder1" };
    const res = createRes();

    await DocumentController.removeFromLocal(req, res as any);

    assert.equal(res.statusCode, 403);
    assert.equal(res.body?.success, false);
  } finally {
    (UserDocument as any).findById = originalFindById;
  }
});

test("mixed batch on POST /document/sync-local-state", async () => {
  const originalIsValid = (require("mongoose").Types.ObjectId as any).isValid;
  const originalFindById = (UserDocument as any).findById;

  const docs = new Map<string, any>([
    [
      "authDoc",
      {
        _id: "authDoc",
        uploaded_by: { toString: () => "owner3" },
        shared_with: [],
        storage_type: StorageType.APP_CLOUD,
        save: async function () {
          this.storage_type = StorageType.CLOUD;
          return this;
        },
      },
    ],
    [
      "forbiddenDoc",
      {
        _id: "forbiddenDoc",
        uploaded_by: { toString: () => "ownerX" },
        shared_with: [],
        storage_type: StorageType.APP,
      },
    ],
  ]);

  try {
    (require("mongoose").Types.ObjectId as any).isValid = (v: string) =>
      ["authDoc", "forbiddenDoc", "missingDoc"].includes(v);
    (UserDocument as any).findById = async (id: string) => docs.get(id) || null;

    const req: any = {
      id: "owner3",
      body: {
        items: [
          { document_id: "authDoc", local_exists: false },
          { document_id: "forbiddenDoc", local_exists: false },
          { document_id: "missingDoc", local_exists: false },
        ],
      },
    };
    const res = createRes();

    await DocumentController.syncLocalState(req, res as any);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body?.success, true);
    assert.equal(res.body?.results?.[0]?.status, "updated");
    assert.equal(res.body?.results?.[1]?.status, "forbidden");
    assert.equal(res.body?.results?.[2]?.status, "not_found");
  } finally {
    (require("mongoose").Types.ObjectId as any).isValid = originalIsValid;
    (UserDocument as any).findById = originalFindById;
  }
});
