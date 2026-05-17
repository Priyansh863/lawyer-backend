import mongoose from 'mongoose';

enum EGenerationMode {
  Daily = 'Daily',
  Weekly = 'Weekly', 
  Manual = 'Manual'
}

enum EArticleStatus {
  Draft = 'Draft',
  Published = 'Published',
  Archived = 'Archived'
}

enum ELegalField {
  FamilyLaw = 'Family Law',
  PropertyLaw = 'Property Law',
  CriminalLaw = 'Criminal Law',
  CorporateLaw = 'Corporate Law',
  LaborLaw = 'Labor Law',
  TaxLaw = 'Tax Law',
  IntellectualProperty = 'Intellectual Property',
  Immigration = 'Immigration'
}

const AIReporterSettingsSchema = new mongoose.Schema(
  {
    targetTags: [{
      type: String,
      required: true
    }],
    legalFields: [{
      type: String,
      enum: Object.values(ELegalField),
      required: true
    }],
    lawyersToFollow: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false
    }],
    generationMode: {
      type: String,
      enum: Object.values(EGenerationMode),
      required: true,
      default: EGenerationMode.Daily
    },
    maxArticlesPerDay: {
      type: Number,
      required: true,
      default: 5,
      min: 1,
      max: 20
    },
    timeOfGeneration: {
      type: String,
      required: true,
      default: '09:00'
    },
    minViewsToAutoArchive: {
      type: Number,
      required: true,
      default: 100,
      min: 0
    },
    maxArticleAge: {
      type: Number,
      required: true,
      default: 30,
      min: 1
    },
    archiveVisibility: {
      homepage: {
        type: Boolean,
        default: true
      },
      dashboard: {
        type: Boolean,
        default: true
      },
      searchOnly: {
        type: Boolean,
        default: false
      }
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true
    },
    aiReporterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

const AIGeneratedArticleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true
    },
    content: { 
      type: String, 
      required: true 
    },
    summary: { 
      type: String, 
      required: false 
    },
    tags: [{ 
      type: String,
      required: false 
    }],
    legalField: {
      type: String,
      enum: Object.values(ELegalField),
      required: false
    },
    referenceLinks: [{ 
      type: String,
      required: false
    }],
    status: {
      type: String,
      enum: Object.values(EArticleStatus),
      required: true,
      default: EArticleStatus.Draft
    },
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      required: false
    },
    views: {
      type: Number,
      default: 0
    },
    likes: {
      type: Number,
      default: 0
    },
    shares: {
      type: Number,
      default: 0
    },
    sourceLawyers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    sourceContent: {
      type: String,
      required: false
    },
    generationPrompt: {
      type: String,
      required: false
    },
    publishedAt: {
      type: Date,
      required: false
    },
    archivedAt: {
      type: Date,
      required: false
    },
    scheduledFor: {
      type: Date,
      required: false
    }
  },
  {
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

AIReporterSettingsSchema.set('toObject', { virtuals: true });
AIReporterSettingsSchema.set('toJSON', { virtuals: true });

AIGeneratedArticleSchema.set('toObject', { virtuals: true });
AIGeneratedArticleSchema.set('toJSON', { virtuals: true });

const AIReporterSettings = mongoose.model('AIReporterSettings', AIReporterSettingsSchema);
const AIGeneratedArticle = mongoose.model('AIGeneratedArticle', AIGeneratedArticleSchema);

export { 
  AIReporterSettings, 
  AIGeneratedArticle, 
  EGenerationMode, 
  EArticleStatus, 
  ELegalField 
};
