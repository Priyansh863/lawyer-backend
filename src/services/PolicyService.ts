import { Policy } from "../models/policy";

export const createPolicy = async (data: any) => {
  return await Policy.create(data);
};

export const getAllPolicies = async () => {
  return await Policy.find();
};

export const getPolicyById = async (id: string) => {
  return await Policy.findById(id);
};

export const updatePolicy = async (id: string, data: any) => {
  return await Policy.findByIdAndUpdate(id, data, { new: true });
};

export const deletePolicy = async (id: string) => {
  return await Policy.findByIdAndDelete(id);
};
