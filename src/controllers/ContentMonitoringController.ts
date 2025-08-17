import { Request, Response } from 'express';
import * as ContentMonitoringService from '../services/ContentMonitoringService';

export const createContent = async (req: Request, res: Response) => {
  try {
    const content = await ContentMonitoringService.createContent(req.body);
    res.status(201).json(content);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create content', details: error });
  }
};

export const getAllContents = async (_req: Request, res: Response) => {
  try {
    const contents = await ContentMonitoringService.getAllContents();
    res.status(200).json(contents);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch contents', details: error });
  }
};

export const getContentById = async (req: Request, res: Response) => {
  try {
    const content = await ContentMonitoringService.getContentById(req.params.id);
    if (!content) return res.status(404).json({ error: 'Content not found' });
    res.status(200).json(content);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch content', details: error });
  }
};

export const updateContent = async (req: Request, res: Response) => {
  try {
    const content = await ContentMonitoringService.updateContent(req.params.id, req.body);
    if (!content) return res.status(404).json({ error: 'Content not found' });
    res.status(200).json(content);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update content', details: error });
  }
};

export const deleteContent = async (req: Request, res: Response) => {
  try {
    const content = await ContentMonitoringService.deleteContent(req.params.id);
    if (!content) return res.status(404).json({ error: 'Content not found' });
    res.status(200).json({ message: 'Content deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete content', details: error });
  }
};
