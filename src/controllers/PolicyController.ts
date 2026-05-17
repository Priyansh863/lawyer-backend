import { Request, Response } from 'express';
import * as PolicyService from '../services/PolicyService';

export const createPolicy = async (req: Request, res: Response) => {
  try {
    const { title, slug, content, meta_description, status } = req.body;
    
    if (!title || !slug || !content) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        details: 'Title, slug, and content are required' 
      });
    }

    const policy = await PolicyService.createPolicy({
      title,
      slug,
      content,
      meta_description,
      status: status || 'Active'
    });
    
    res.status(201).json({
      success: true,
      message: 'Policy created successfully',
      data: policy
    });
  } catch (error: any) {
    if (error.message === 'A policy with this slug already exists') {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create policy', details: error.message });
  }
};

export const getAllPolicies = async (_req: Request, res: Response) => {
  try {
    const policies = await PolicyService.getAllPolicies();
    res.status(200).json({
      success: true,
      data: policies,
      count: policies.length
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch policies', details: error.message });
  }
};

export const getPolicyById = async (req: Request, res: Response) => {
  try {
    const policy = await PolicyService.getPolicyById(req.params.id);
    if (!policy) return res.status(404).json({ error: 'Policy not found' });
    
    res.status(200).json({
      success: true,
      data: policy
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch policy', details: error.message });
  }
};

export const getPolicyBySlug = async (req: Request, res: Response) => {
  try {
    const policy = await PolicyService.getPolicyBySlug(req.params.slug);
    if (!policy) return res.status(404).json({ error: 'Policy not found' });
    
    res.status(200).json({
      success: true,
      data: policy
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch policy', details: error.message });
  }
};

export const updatePolicy = async (req: Request, res: Response) => {
  try {
    const policy = await PolicyService.updatePolicy(req.params.id, req.body);
    if (!policy) return res.status(404).json({ error: 'Policy not found' });
    
    res.status(200).json({
      success: true,
      message: 'Policy updated successfully',
      data: policy
    });
  } catch (error: any) {
    if (error.message === 'A policy with this slug already exists') {
      return res.status(409).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update policy', details: error.message });
  }
};

export const deletePolicy = async (req: Request, res: Response) => {
  try {
    const policy = await PolicyService.deletePolicy(req.params.id);
    if (!policy) return res.status(404).json({ error: 'Policy not found' });
    
    res.status(200).json({ 
      success: true,
      message: 'Policy deleted successfully' 
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete policy', details: error.message });
  }
};

export const getPoliciesByStatus = async (req: Request, res: Response) => {
  try {
    const { status } = req.params;
    if (status !== 'Active' && status !== 'Inactive') {
      return res.status(400).json({ error: 'Invalid status. Must be Active or Inactive' });
    }
    
    const policies = await PolicyService.getPoliciesByStatus(status);
    res.status(200).json({
      success: true,
      data: policies,
      count: policies.length
    });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch policies', details: error.message });
  }
};
