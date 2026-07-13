export type QueryStatus = "pending" | "responded" | "follow_up" | "on_hold" | "moved_to_pipeline" | "order_won" | "order_lost";

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