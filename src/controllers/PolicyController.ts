import { Request, Response } from 'express';
import * as PolicyService from '../services/PolicyService';

export const createPolicy = async (req: Request, res: Response) => {
  try {
    const policy = await PolicyService.createPolicy(req.body);
    res.status(201).json(policy);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create policy', details: error });
  }
};

export const getAllPolicies = async (_req: Request, res: Response) => {
  try {
    const policies = await PolicyService.getAllPolicies();
    res.status(200).json(policies);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch policies', details: error });
  }
};

export const getPolicyById = async (req: Request, res: Response) => {
  try {
    const policy = await PolicyService.getPolicyById(req.params.id);
    if (!policy) return res.status(404).json({ error: 'Policy not found' });
    res.status(200).json(policy);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch policy', details: error });
  }
};

export const updatePolicy = async (req: Request, res: Response) => {
  try {
    const policy = await PolicyService.updatePolicy(req.params.id, req.body);
    if (!policy) return res.status(404).json({ error: 'Policy not found' });
    res.status(200).json(policy);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update policy', details: error });
  }
};

export const deletePolicy = async (req: Request, res: Response) => {
  try {
    const policy = await PolicyService.deletePolicy(req.params.id);
    if (!policy) return res.status(404).json({ error: 'Policy not found' });
    res.status(200).json({ message: 'Policy deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete policy', details: error });
  }
};
