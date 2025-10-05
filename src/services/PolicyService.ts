import { Policy } from "../models/policy";
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import dbConfig from "../config/secretManagerConfig";

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

// AI Policy Generation Service
class PolicyAIService {
  private openai: OpenAI | null = null;
  private googleAI: GoogleGenAI | null = null;
  private initPromise: Promise<void> | null = null;
  private initialized: boolean = false;

  constructor() {
    this.initPromise = this.init();
  }

  private async init(): Promise<void> {
    try {
      const dbData = await dbConfig.secretManagerConnection();

      if (!dbData.openaiApiKey) {
        throw new Error("OpenAI API key not found in configuration");
      }

      if (!dbData.googleAiApiKey) {
        console.warn("Google AI API key not found - image generation will be unavailable");
      }

      this.openai = new OpenAI({
        apiKey: dbData.openaiApiKey,
      });

      if (dbData.googleAiApiKey) {
        this.googleAI = new GoogleGenAI({
          apiKey: dbData.googleAiApiKey,
        });
      }

      this.initialized = true;
      console.log("AI clients initialized successfully for PolicyService");
    } catch (error) {
      console.error("Failed to initialize AI clients:", error);
      this.initialized = false;
      this.openai = null;
      this.googleAI = null;
      throw error;
    }
  }

  // ...existing AI methods...
}
