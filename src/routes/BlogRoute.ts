import express from 'express';
import BlogController from '../controllers/BlogController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Create a new blog
router.post('/create', authenticateToken, BlogController.createBlog);

// Get all blogs with pagination and filtering
router.get('/list', BlogController.getBlogs);

// Get user's own blogs
router.get('/my-blogs', authenticateToken, BlogController.getUserBlogs);

// Get single blog by ID
router.get('/:blogId', BlogController.getBlogById);

// Update blog
router.put('/:blogId', authenticateToken, BlogController.updateBlog);

// Delete blog
router.delete('/:blogId', authenticateToken, BlogController.deleteBlog);

// Get blog categories
router.get('/categories/list', BlogController.getBlogCategories);

// Get popular blogs
router.get('/popular/list', BlogController.getPopularBlogs);

// Get related blogs
router.get('/:blogId/related', BlogController.getRelatedBlogs);

// Increment blog views
router.put('/:blogId/views', BlogController.incrementBlogViews);

export default router;
