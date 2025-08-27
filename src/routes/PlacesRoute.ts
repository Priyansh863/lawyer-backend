import express from 'express';
import { PlacesController } from '../controllers/PlacesController';
import { query, param } from 'express-validator';

const router = express.Router();

// Search places using Google Places Text Search API
router.get('/search', [
  query('query')
    .notEmpty()
    .withMessage('Query parameter is required')
    .isLength({ min: 1, max: 200 })
    .withMessage('Query must be between 1 and 200 characters'),
  query('language')
    .optional()
    .isLength({ min: 2, max: 5 })
    .withMessage('Language must be a valid language code'),
  query('region')
    .optional()
    .isLength({ min: 2, max: 5 })
    .withMessage('Region must be a valid region code'),
  query('type')
    .optional()
    .isIn(['address', 'place'])
    .withMessage('Type must be either address or place')
], PlacesController.searchPlaces);

// Get place details by place_id
router.get('/details/:place_id', [
  param('place_id')
    .notEmpty()
    .withMessage('Place ID is required')
    .isLength({ min: 10, max: 200 })
    .withMessage('Invalid place ID format')
], PlacesController.getPlaceDetails);

export default router;
