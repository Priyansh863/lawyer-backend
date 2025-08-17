import mongoose from 'mongoose';
import { DocumentType, DocumentPrivacy } from '../models/user_documents';
import { CaseStatus } from '../models/case';

export async function up(db: typeof mongoose) {
  const session = await db.startSession();
  session.startTransaction();
  
  try {
    // 1. Update User Documents Collection
    await db.connection.db.collection('userdocuments').updateMany(
      { privacy: { $exists: false } },
      { $set: { 
        privacy: DocumentPrivacy.PRIVATE,
        document_type: DocumentType.GENERAL,
        shared_with: [] 
      }}
    );

    // 2. Update Cases Collection
    await db.connection.db.collection('cases').updateMany(
      {},
      [
        {
          $set: {
            documents: [],
            status_history: [
              {
                status: { $ifNull: ["$status", CaseStatus.OPEN] },
                changed_at: new Date(),
                changed_by: "$lawyer_id",
                notes: "Initial status"
              }
            ]
          }
        },
        {
          $unset: "files"
        }
      ]
    );

    // 3. Update Meetings Collection
    await db.connection.db.collection('meetings').updateMany(
      {},
      [
        {
          $set: {
            meeting_type: 'video',
            start_time: { $ifNull: ["$requested_date", new Date()] },
            end_time: { 
              $dateAdd: { 
                startDate: { $ifNull: ["$requested_date", new Date()] },
                unit: 'minute',
                amount: 30 // Default 30-minute meeting
              }
            },
            duration_minutes: 30,
            timezone: 'UTC',
            initiated_by: { $cond: { 
              if: { $eq: ["$created_by", "$lawyer_id"] },
              then: 'lawyer',
              else: 'client'
            }},
            status: {
              $switch: {
                branches: [
                  { case: { $eq: ["$status", "pending"] }, then: 'pending_approval' },
                  { case: { $eq: ["$status", "approved"] }, then: 'approved' },
                  { case: { $eq: ["$status", "rejected"] }, then: 'rejected' },
                  { case: { $eq: ["$status", "scheduled"] }, then: 'scheduled' },
                  { case: { $eq: ["$status", "active"] }, then: 'active' },
                  { case: { $eq: ["$status", "completed"] }, then: 'completed' },
                  { case: { $eq: ["$status", "cancelled"] }, then: 'cancelled' }
                ],
                default: 'pending_approval'
              }
            },
            updated_by: { $ifNull: ["$created_by", new mongoose.Types.ObjectId()] },
            reminder_sent: false
          }
        },
        {
          $unset: [
            "requested_date",
            "requested_time",
            "approval_date"
          ]
        }
      ]
    );

    await session.commitTransaction();
    console.log('Database migration completed successfully');
  } catch (error) {
    await session.abortTransaction();
    console.error('Migration failed:', error);
    throw error;
  } finally {
    session.endSession();
  }
}

export async function down(db: typeof mongoose) {
  // Rollback logic if needed
  console.log('Rolling back schema changes is not fully implemented');
}

// Run the migration if this file is executed directly
if (require.main === module) {
  require('dotenv').config();
  
  const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lawyer_app';
  
  mongoose.connect(MONGODB_URI)
    .then(() => up(mongoose))
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
