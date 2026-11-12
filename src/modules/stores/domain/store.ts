export interface Store {
  id: string;
  code: string;
  name: string;
  address: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  createdAt: Date;
  updatedAt: Date;
}
export interface NewStore { code: string; name: string; address?: string; }
