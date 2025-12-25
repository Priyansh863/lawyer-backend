# PC ID Validation - How It Works

## Overview
The PC ID validation checks the **specific user's saved PC ID** in the database, NOT a random check. It validates the PC ID for the user who is attempting to log in.

## Flow Diagram

```
Login Request (with email + password + pcId)
    ↓
Find User by Email
    ↓
Verify Password
    ↓
Check if pcId provided?
    ├─ NO → Website Login (Allow)
    └─ YES → PC Login Validation
              ↓
        Get User's Saved pcId from Database
              ↓
        Compare: Request pcId === User's Saved pcId?
              ├─ Match → Allow Login ✅
              └─ No Match → Block Login ❌
```

## Step-by-Step Logic

### 1. User Login Request
```json
POST /api/v1/auth/login
{
  "email": "user@example.com",
  "password": "password123",
  "pcId": "8f45aad9fb4b84597eeeb30c9dd284eb1056b5e661217236b8483c9c943e06c3"
}
```

### 2. Backend Process

**Step 1:** Find the user by email
```javascript
const userInfo = await User.findOne({ email: "user@example.com" });
// This finds the SPECIFIC user trying to log in
```

**Step 2:** Verify password (standard authentication)

**Step 3:** If `pcId` is provided in request:
```javascript
// Get the saved PC ID for THIS SPECIFIC USER
const savedPcId = userInfo.pcId;  // From the user's database record

// Compare with the PC ID from the login request
if (savedPcId !== providedPcId) {
  // Block login - PC ID doesn't match THIS user's saved PC ID
}
```

## Example Scenarios

### Scenario 1: Website Login (No PC ID)
**Request:**
```json
{
  "email": "lawyer@example.com",
  "password": "password123"
}
```

**Database State:**
```
User: lawyer@example.com
pcId: "abc123..." (saved in database)
```

**Result:** ✅ **ALLOWED** - No pcId provided, treated as website login

---

### Scenario 2: PC Login - Correct PC ID
**Request:**
```json
{
  "email": "lawyer@example.com",
  "password": "password123",
  "pcId": "abc123..."
}
```

**Database State:**
```
User: lawyer@example.com
pcId: "abc123..." (saved in database)
```

**Validation:**
- Request pcId: `"abc123..."`
- User's saved pcId: `"abc123..."`
- Match? ✅ YES

**Result:** ✅ **ALLOWED** - PC ID matches this user's saved PC ID

---

### Scenario 3: PC Login - Wrong PC ID
**Request:**
```json
{
  "email": "lawyer@example.com",
  "password": "password123",
  "pcId": "wrong-pc-id-xyz789"
}
```

**Database State:**
```
User: lawyer@example.com
pcId: "abc123..." (saved in database)
```

**Validation:**
- Request pcId: `"wrong-pc-id-xyz789"`
- User's saved pcId: `"abc123..."`
- Match? ❌ NO

**Result:** ❌ **BLOCKED** - Response: `{ "success": false, "message": "pc_id_mismatch" }`

---

### Scenario 4: PC Login - User Has No Saved PC ID
**Request:**
```json
{
  "email": "newuser@example.com",
  "password": "password123",
  "pcId": "some-pc-id"
}
```

**Database State:**
```
User: newuser@example.com
pcId: null (no PC ID saved yet)
```

**Validation:**
- Request pcId: `"some-pc-id"`
- User's saved pcId: `null`
- Has saved PC ID? ❌ NO

**Result:** ❌ **BLOCKED** - Response: `{ "success": false, "message": "pc_id_not_registered" }`

---

### Scenario 5: Different Users, Different PC IDs
**User A Login:**
```json
{
  "email": "userA@example.com",
  "password": "password123",
  "pcId": "pc-id-for-user-a"
}
```

**User B Login:**
```json
{
  "email": "userB@example.com",
  "password": "password123",
  "pcId": "pc-id-for-user-b"
}
```

**Database State:**
```
User A: userA@example.com → pcId: "pc-id-for-user-a"
User B: userB@example.com → pcId: "pc-id-for-user-b"
```

**Result:** 
- User A with `pc-id-for-user-a` → ✅ ALLOWED
- User B with `pc-id-for-user-b` → ✅ ALLOWED
- User A with `pc-id-for-user-b` → ❌ BLOCKED (mismatch)
- User B with `pc-id-for-user-a` → ❌ BLOCKED (mismatch)

## Key Points

1. **User-Specific Check**: The validation checks the PC ID for the **specific user** logging in (identified by email)

2. **Not a Random Check**: It does NOT randomly check PC IDs in the database. It only checks the logged-in user's saved PC ID.

3. **One PC ID Per User**: Each user can have only one saved PC ID in their database record.

4. **PC ID Uniqueness**: The `save-pc-id` endpoint ensures no two users can have the same PC ID (see line 735-738 in UserController.ts).

## Code Reference

**Login Validation (AuthService.ts):**
```typescript
// Line 41: Extract email and pcId from request
const { email, password, pcId } = data;

// Line 46: Find the SPECIFIC user by email
const userInfo = await User.findOne({ email: email.toLowerCase() });

// Line 93: Get THIS USER's saved PC ID
const savedPcId = userInfo.pcId;

// Line 105: Compare THIS USER's saved PC ID with provided PC ID
if (savedPcId.trim() !== pcId.trim()) {
  // Block login - doesn't match THIS user's PC ID
}
```

**Save PC ID (UserController.ts):**
```typescript
// Line 748-755: Save PC ID to THIS SPECIFIC USER's record
const updatedUser = await User.findByIdAndUpdate(
  userId,  // The authenticated user's ID
  { pcId: pcId.trim() }
);
```

## Summary

✅ **It checks the PC ID for the specific user logging in**  
❌ **It does NOT randomly check PC IDs in the database**

The validation flow:
1. User provides email → Find that user
2. User provides pcId → Check that user's saved pcId
3. Match? → Allow | No Match? → Block

