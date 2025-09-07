import express from 'express';
import { BookmarkController } from '../controllers/BookmarkController';
import { authenticateToken } from '../middleware/auth';
import Auth from '../middlewares/auth';

const router = express.Router();

// Add bookmark
router.post('/add', Auth, BookmarkController.addBookmark);

// Remove bookmark
router.delete('/remove/:postId', Auth, BookmarkController.removeBookmark);

// Get user bookmarks
router.get('/user', Auth, BookmarkController.getUserBookmarks);

// Check if post is bookmarked
router.get('/check/:postId', Auth, BookmarkController.checkBookmark);

// Toggle bookmark
router.post('/toggle', Auth, BookmarkController.toggleBookmark);

export default router;
