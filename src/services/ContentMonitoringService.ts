import { ContentMonitoring } from '../models/content_monitoring';

export const createContent = async (data: any) => {
  return await ContentMonitoring.create(data);
};

export const getAllContents = async () => {
  return await ContentMonitoring.find();
};

export const getContentById = async (id: string) => {
  return await ContentMonitoring.findById(id);
};

export const updateContent = async (id: string, data: any) => {
  return await ContentMonitoring.findByIdAndUpdate(id, data, { new: true });
};

export const deleteContent = async (id: string) => {
  return await ContentMonitoring.findByIdAndDelete(id);
};
