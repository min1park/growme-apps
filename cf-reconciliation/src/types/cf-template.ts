import { CFCategory } from './project';

export interface CFTemplate {
  id: string;
  name: string;
  sections: CFSection[];
}

export interface CFSection {
  id: string;
  type: 'operating' | 'investing' | 'financing' | 'cash-summary' | 'noncash';
  title: string;
  items: CFItem[];
}

export interface CFItem {
  id: string;
  parentId: string | null;
  sectionId: string;
  label: string;
  level: number;
  isSubtotal: boolean;
  isEditable: boolean;
  order: number;
  sign: 1 | -1;
  defaultCfCategories?: CFCategory[];
}
