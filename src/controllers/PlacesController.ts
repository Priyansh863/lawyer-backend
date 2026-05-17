import { Request, Response } from 'express';
import axios from 'axios';
import dbConfig from '../config/secretManagerConfig';
import { ISecretManagerData } from '../Interfaces/commonInterfaces';

export class PlacesController {
  /**
   * Search places using Google Places Text Search API
   */
  static async searchPlaces(req: Request, res: Response) {
    try {
      const { query, language, region, type } = req.query;

      if (!query || typeof query !== 'string') {
        return res.status(400).json({
          success: false,
          message: 'Query parameter is required'
        });
      }

      console.log(req.query,"jjjjjjjjjjjjjjjjj")

      // Build Google Places API request
      const params = new URLSearchParams();
      params.set('query', query);
      
      // Add language support (default to Korean if not specified)
      if (language && typeof language === 'string') {
        params.set('language', language);
      } else {
        params.set('language', 'ko'); // Default to Korean
      }
      
      // Add region support for better Korean results
      if (region && typeof region === 'string') {
        params.set('region', region);
      } else {
        params.set('region', 'kr'); // Default to South Korea
      }
      
      // Add type filter if specified
      if (type && typeof type === 'string') {
        params.set('type', type);
      }
      
      // Get API key from Secrets Manager
      const dbData = await dbConfig.secretManagerConnection() as ISecretManagerData;
      params.set('key', dbData.googleApiKey);

      const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`;
      
      const response = await axios.get(url);
      console.log(response,"responseresponseresponseresponseresponseresponseresponse");
      const data = response.data;

      // Handle Places API status codes
      if (data.status && data.status !== 'OK') {
        console.warn('Places API non-OK status:', data.status, data.error_message);
        
        if (data.status === 'ZERO_RESULTS') {
          return res.json({
            success: true,
            results: []
          });
        }
        
        return res.status(400).json({
          success: false,
          message: data.error_message || `Places API error: ${data.status}`
        });
      }

      // Format results for frontend
      const formattedResults = (data.results || []).slice(0, 5).map((place: any) => ({
        place_id: place.place_id,
        name: place.name,
        description: place.formatted_address || place.name,
        lat: place.geometry?.location?.lat,
        lng: place.geometry?.location?.lng,
        types: place.types,
      }));

      res.json({
        success: true,
        results: formattedResults
      });

    } catch (error: any) {
      console.error('Places search error:', error);
   

      res.json({
        success: true,
        results: [],
        fallback: true
      });
    }
  }

  /**
   * Get place details by place_id
   */
  static async getPlaceDetails(req: Request, res: Response) {
    try {
      const { place_id } = req.params;
      const { language, region } = req.query;

      if (!place_id) {
        return res.status(400).json({
          success: false,
          message: 'Place ID is required'
        });
      }

      const params = new URLSearchParams();
      params.set('place_id', place_id);
      params.set('fields', 'name,formatted_address,geometry,types,place_id');
      
      // Add language support (default to Korean if not specified)
      if (language && typeof language === 'string') {
        params.set('language', language);
      } else {
        params.set('language', 'ko'); // Default to Korean
      }
      
      // Add region support for better Korean results
      if (region && typeof region === 'string') {
        params.set('region', region);
      } else {
        params.set('region', 'kr'); // Default to South Korea
      }
      
      // Get API key from Secrets Manager
      const dbData = await dbConfig.secretManagerConnection() as ISecretManagerData;
      params.set('key', dbData.googleApiKey);

      const url = `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`;
      
      const response = await axios.get(url);
      const data = response.data;

      if (data.status && data.status !== 'OK') {
        return res.status(400).json({
          success: false,
          message: data.error_message || `Places API error: ${data.status}`
        });
      }

      const place = data.result;
      const formattedPlace = {
        place_id: place.place_id,
        name: place.name,
        description: place.formatted_address || place.name,
        lat: place.geometry?.location?.lat,
        lng: place.geometry?.location?.lng,
        types: place.types,
      };

      res.json({
        success: true,
        result: formattedPlace
      });

    } catch (error: any) {
      console.error('Place details error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch place details'
      });
    }
  }
}
