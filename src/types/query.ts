export type QueryStatus = 'pending' | 'in_review' | 'confirmed' | 'rejected';

export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ProductQuery {
  id: string;
  productName: string;
  productCode: string;
  quantity: number;
  customerName: string;
  customerCompany: string;
  salesPerson: string;
  urgency: UrgencyLevel;
  notes: string;
  status: QueryStatus;
  createdAt: Date;
  updatedAt: Date;
  response?: {
    pricing?: string;
    availability?: string;
    leadTime?: string;
    notes?: string;
  };
}
