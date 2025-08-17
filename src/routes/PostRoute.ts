import express from 'express';
import PostController from '../controllers/PostController';
import { authenticateToken } from '../middleware/auth';
import { body, param, query } from 'express-validator';

const router = express.Router();

// Create a new post with spatial metadata
router.post('/create', [
  authenticateToken,
  body('title')
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ min: 3, max: 200 })
    .withMessage('Title must be between 3 and 200 characters'),
  body('content')
    .notEmpty()
    .withMessage('Content is required')
    .isLength({ min: 10, max: 5000 })
    .withMessage('Content must be between 10 and 5000 characters'),
  body('status')
    .optional()
    .isIn(['draft', 'published'])
    .withMessage('Status must be either draft or published'),
  body('spatialInfo.planet')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Planet name must be less than 50 characters'),
  body('spatialInfo.latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  body('spatialInfo.longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),
  body('spatialInfo.altitude')
    .optional()
    .isFloat({ min: -500, max: 9000 })
    .withMessage('Altitude must be between -500 and 9000 meters'),
  body('spatialInfo.timestamp')
    .optional()
    .isISO8601()
    .withMessage('Timestamp must be in ISO 8601 format'),
  body('spatialInfo.floor')
    .optional()
    .isInt()
    .withMessage('Floor must be an integer'),
  body('citations')
    .optional()
    .isArray()
    .withMessage('Citations must be an array'),
  body('citations.*.type')
    .optional()
    .isIn(['spatial', 'user', 'url'])
    .withMessage('Citation type must be spatial, user, or url'),
  body('citations.*.content')
    .optional()
    .isLength({ min: 1, max: 500 })
    .withMessage('Citation content must be between 1 and 500 characters')
], PostController.createPost);

// Get all posts with pagination and filtering
router.get('/list', [
  authenticateToken,
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  query('status')
    .optional()
    .isIn(['draft', 'published'])
    .withMessage('Invalid status'),
  query('author')
    .optional()
    .isMongoId()
    .withMessage('Invalid author ID'),
  query('search')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be between 1 and 100 characters'),
  query('hasLocation')
    .optional()
    .isBoolean()
    .withMessage('hasLocation must be a boolean')
], PostController.getPosts);

// Get user's own posts
router.get('/my-posts', [
  authenticateToken,
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  query('status')
    .optional()
    .isIn(['draft', 'published'])
    .withMessage('Invalid status')
], PostController.getMyPosts);

// Parse location from URL
router.post('/parse-location', [
  body('url')
    .notEmpty()
    .withMessage('URL is required')
    .isURL()
    .withMessage('Invalid URL format')
], PostController.parseLocationUrl);

// Generate QR code for post
router.post('/:slug/qr-code', [
  authenticateToken,
  param('slug')
    .notEmpty()
    .withMessage('Post slug is required')
    .matches(/^[a-z0-9-]+$/)
    .withMessage('Invalid slug format')
], PostController.generateQrCode);

// Generate AI post
router.post('/generate-ai', [
  authenticateToken,
  body('prompt')
    .optional()
    .isLength({ min: 3, max: 500 })
    .withMessage('Prompt must be between 3 and 500 characters'),
  body('topic')
    .optional()
    .isLength({ min: 3, max: 200 })
    .withMessage('Topic must be between 3 and 200 characters'),
  body('tone')
    .optional()
    .isIn(['professional', 'casual', 'formal', 'friendly'])
    .withMessage('Invalid tone. Must be professional, casual, formal, or friendly'),
  body('length')
    .optional()
    .isIn(['short', 'long'])
    .withMessage('Length must be either short or long'),
  body('includeHashtags')
    .optional()
    .isBoolean()
    .withMessage('includeHashtags must be a boolean')
], (req, res) => {
  const postController = new PostController ();
  postController.generateAiPost(req, res);
});

// Get single post by ID
router.get('/id/:id', [
  authenticateToken,
  param('id')
    .notEmpty()
    .withMessage('Post ID is required')
    .isMongoId()
    .withMessage('Invalid post ID format')
], PostController.getPostById);

// Get single post by slug  
router.get('/slug/:slug', [
  authenticateToken,
  param('slug')
    .notEmpty()
    .withMessage('Post slug is required')
    .matches(/^[a-z0-9가-힣-]+$/)
    .withMessage('Invalid slug format')
], PostController.getPostBySlug);

export default router;
