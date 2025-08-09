import express from 'express';
import BlogController from '../controllers/BlogController';
import { authenticateToken } from '../middleware/auth';
import { body, param, query } from 'express-validator';

const router = express.Router();

// Create a new blog
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
    .isLength({ min: 10 })
    .withMessage('Content must be at least 10 characters long'),
  body('category')
    .notEmpty()
    .withMessage('Category is required')
    .isIn(['legal-advice', 'case-studies', 'law-updates', 'firm-news'])
    .withMessage('Invalid category'),
  body('status')
    .optional()
    .isIn(['draft', 'published'])
    .withMessage('Status must be either draft or published'),
  body('excerpt')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Excerpt must be less than 500 characters'),
  body('image')
    .optional()
    .isURL()
    .withMessage('Image must be a valid URL')
], BlogController.createBlog);

// Get all blogs with pagination and filtering
router.get('/list', [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  query('category')
    .optional()
    .isIn(['legal-advice', 'case-studies', 'law-updates', 'firm-news'])
    .withMessage('Invalid category'),
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
    .withMessage('Search query must be between 1 and 100 characters')
], BlogController.getBlogs);

// Get user's own blogs
router.get('/my-blogs', [
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
], BlogController.getUserBlogs);

// Get single blog by ID
router.get('/:blogId', [
  param('blogId')
    .isMongoId()
    .withMessage('Invalid blog ID format')
], BlogController.getBlogById);

// Update blog
router.put('/:blogId', [
  authenticateToken,
  param('blogId')
    .isMongoId()
    .withMessage('Invalid blog ID format'),
  body('title')
    .optional()
    .isLength({ min: 3, max: 200 })
    .withMessage('Title must be between 3 and 200 characters'),
  body('content')
    .optional()
    .isLength({ min: 10 })
    .withMessage('Content must be at least 10 characters long'),
  body('category')
    .optional()
    .isIn(['legal-advice', 'case-studies', 'law-updates', 'firm-news'])
    .withMessage('Invalid category'),
  body('status')
    .optional()
    .isIn(['draft', 'published'])
    .withMessage('Status must be either draft or published'),
  body('excerpt')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Excerpt must be less than 500 characters'),
  body('image')
    .optional()
    .isURL()
    .withMessage('Image must be a valid URL')
], BlogController.updateBlog);

// Delete blog
router.delete('/:blogId', [
  authenticateToken,
  param('blogId')
    .isMongoId()
    .withMessage('Invalid blog ID format')
], BlogController.deleteBlog);

export default router;
