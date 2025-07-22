import express from 'express';
import { body, param, query } from 'express-validator';
import AIMarketingController from '../controllers/AIMarketingController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Validation rules
const generatePostValidation = [
  body('prompt')
    .notEmpty()
    .withMessage('Prompt is required')
    .isLength({ min: 10, max: 2000 })
    .withMessage('Prompt must be between 10 and 2000 characters'),
  body('contentType')
    .optional()
    .isIn(['post', 'article', 'social_media'])
    .withMessage('Content type must be post, article, or social_media'),
  body('platforms')
    .optional()
    .isArray()
    .withMessage('Platforms must be an array'),
  body('platforms.*')
    .optional()
    .isIn(['linkedin', 'twitter', 'facebook', 'instagram', 'youtube'])
    .withMessage('Invalid platform'),
  body('imageUrls')
    .optional()
    .isArray()
    .withMessage('Image URLs must be an array'),
  body('imageUrls.*')
    .optional()
    .isURL()
    .withMessage('Invalid image URL'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('tags.*')
    .optional()
    .isString()
    .withMessage('Each tag must be a string')
];

const updatePostValidation = [
  param('postId')
    .isMongoId()
    .withMessage('Invalid post ID'),
  body('status')
    .optional()
    .isIn(['draft', 'published', 'scheduled'])
    .withMessage('Status must be draft, published, or scheduled'),
  body('scheduledAt')
    .optional()
    .isISO8601()
    .withMessage('Scheduled date must be a valid ISO 8601 date'),
  body('platforms')
    .optional()
    .isArray()
    .withMessage('Platforms must be an array'),
  body('platforms.*')
    .optional()
    .isIn(['linkedin', 'twitter', 'facebook', 'instagram', 'youtube'])
    .withMessage('Invalid platform'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array')
];

const postIdValidation = [
  param('postId')
    .isMongoId()
    .withMessage('Invalid post ID')
];

const platformValidation = [
  param('platform')
    .isIn(['linkedin', 'twitter', 'facebook', 'instagram', 'youtube'])
    .withMessage('Invalid platform')
];

const engagementValidation = [
  param('postId')
    .isMongoId()
    .withMessage('Invalid post ID'),
  body('likes')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Likes must be a non-negative integer'),
  body('shares')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Shares must be a non-negative integer'),
  body('comments')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Comments must be a non-negative integer'),
  body('views')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Views must be a non-negative integer')
];

const paginationValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('status')
    .optional()
    .isIn(['draft', 'published', 'scheduled'])
    .withMessage('Status must be draft, published, or scheduled'),
  query('contentType')
    .optional()
    .isIn(['post', 'article', 'social_media'])
    .withMessage('Content type must be post, article, or social_media')
];

// Routes

/**
 * @route   POST /api/v1/ai-marketing/generate
 * @desc    Generate AI marketing post from prompt
 * @access  Private
 * @body    { prompt, contentType?, platforms?, imageUrls?, tags? }
 */
router.post(
  '/generate',
  authenticateToken,
  generatePostValidation,
  AIMarketingController.generatePost
);

/**
 * @route   GET /api/v1/ai-marketing/posts
 * @desc    Get all AI marketing posts for authenticated user
 * @access  Private
 * @query   { page?, limit?, status?, contentType? }
 */
router.get(
  '/posts',
  authenticateToken,
  paginationValidation,
  AIMarketingController.getUserPosts
);

/**
 * @route   GET /api/v1/ai-marketing/posts/:postId
 * @desc    Get single AI marketing post by ID
 * @access  Private
 */
router.get(
  '/posts/:postId',
  authenticateToken,
  postIdValidation,
  AIMarketingController.getPostById
);

/**
 * @route   PUT /api/v1/ai-marketing/posts/:postId
 * @desc    Update AI marketing post
 * @access  Private
 * @body    { status?, scheduledAt?, platforms?, tags? }
 */
router.put(
  '/posts/:postId',
  authenticateToken,
  updatePostValidation,
  AIMarketingController.updatePost
);

/**
 * @route   DELETE /api/v1/ai-marketing/posts/:postId
 * @desc    Delete AI marketing post (soft delete)
 * @access  Private
 */
router.delete(
  '/posts/:postId',
  authenticateToken,
  postIdValidation,
  AIMarketingController.deletePost
);

/**
 * @route   POST /api/v1/ai-marketing/posts/:postId/regenerate
 * @desc    Regenerate content for existing post
 * @access  Private
 * @body    { newPrompt? }
 */
router.post(
  '/posts/:postId/regenerate',
  authenticateToken,
  postIdValidation,
  body('newPrompt')
    .optional()
    .isLength({ min: 10, max: 2000 })
    .withMessage('New prompt must be between 10 and 2000 characters'),
  AIMarketingController.regenerateContent
);

/**
 * @route   GET /api/v1/ai-marketing/platform/:platform/posts
 * @desc    Get AI marketing posts by platform
 * @access  Private
 * @query   { page?, limit? }
 */
router.get(
  '/platform/:platform/posts',
  authenticateToken,
  platformValidation,
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  AIMarketingController.getPostsByPlatform
);

/**
 * @route   PUT /api/v1/ai-marketing/posts/:postId/engagement
 * @desc    Update engagement metrics for a post
 * @access  Private
 * @body    { likes?, shares?, comments?, views? }
 */
router.put(
  '/posts/:postId/engagement',
  authenticateToken,
  engagementValidation,
  AIMarketingController.updateEngagementMetrics
);

/**
 * @route   GET /api/v1/ai-marketing/analytics
 * @desc    Get analytics/stats for user's AI marketing posts
 * @access  Private
 */
router.get(
  '/analytics',
  authenticateToken,
  AIMarketingController.getPostAnalytics
);

export default router;
