import { Policy } from "../models/policy";

interface PolicyData {
  title: string;
  slug: string;
  content: string;
  meta_description?: string;
  status: 'Active' | 'Inactive';
}

export const createPolicy = async (data: PolicyData) => {
  // Check if slug already exists
  const existingPolicy = await Policy.findOne({ slug: data.slug });
  if (existingPolicy) {
    throw new Error('A policy with this slug already exists');
  }
  
  return await Policy.create(data);
};

export const getAllPolicies = async () => {
  return await Policy.find().sort({ created_at: -1 });
};

export const getPolicyById = async (id: string) => {
  return await Policy.findById(id);
};

export const getPolicyBySlug = async (slug: string) => {
  return await Policy.findOne({ slug });
};

export const updatePolicy = async (id: string, data: Partial<PolicyData>) => {
  // If slug is being updated, check if it already exists
  if (data.slug) {
    const existingPolicy = await Policy.findOne({ 
      slug: data.slug, 
      _id: { $ne: id } 
    });
    if (existingPolicy) {
      throw new Error('A policy with this slug already exists');
    }
  }
  
  return await Policy.findByIdAndUpdate(id, data, { new: true });
};

export const deletePolicy = async (id: string) => {
  return await Policy.findByIdAndDelete(id);
};

export const getPoliciesByStatus = async (status: 'Active' | 'Inactive') => {
  return await Policy.find({ status }).sort({ created_at: -1 });
};
