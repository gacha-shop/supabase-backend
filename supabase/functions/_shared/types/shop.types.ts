/**
 * Shop 관련 타입 정의
 */

export interface SNS {
  website?: string;
  instagram?: string;
  x?: string;
  youtube?: string;
}

export interface Shop {
  id: string;
  name: string;
  shop_type: string[]; // Array of shop types: gacha, figure, claw, etc.
  description: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  business_hours: any | null;
  is_24_hours: boolean | null;
  gacha_machine_count: number | null;
  main_series: string[] | null;
  verification_status: 'pending' | 'verified' | 'rejected';
  data_source: 'admin_input' | 'user_input' | 'crawling';
  sido: string;
  sigungu: string | null;
  jibun_address: string | null;
  road_address: string;
  detail_address: string | null;
  zone_code: string | null;
  building_name: string | null;
  social_urls: Partial<SNS> | null;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: string | null;
  updated_by: string | null;
}

export interface ShopCreateInput {
  name: string;
  shop_type: string[]; // Array of shop types: gacha, figure, claw, etc.
  description?: string;
  phone?: string;
  latitude?: number;
  longitude?: number;
  business_hours?: any;
  is_24_hours?: boolean;
  gacha_machine_count?: number;
  main_series?: string[];
  sido: string;
  sigungu?: string;
  jibun_address?: string;
  road_address: string;
  detail_address?: string;
  zone_code?: string;
  building_name?: string;
  social_urls?: Partial<SNS>;
  tag_ids?: string[];
}

export interface ShopUpdateInput {
  name?: string;
  shop_type?: string[];
  description?: string;
  phone?: string;
  latitude?: number;
  longitude?: number;
  business_hours?: any;
  is_24_hours?: boolean;
  gacha_machine_count?: number;
  main_series?: string[];
  detail_address?: string;
  social_urls?: Partial<SNS>;
  verification_status?: 'pending' | 'verified' | 'rejected';
  tag_ids?: string[];
}

export interface ShopWithTags extends Shop {
  shop_tags?: {
    tag_id: string;
    tags: {
      id: string;
      name: string;
      description: string | null;
    };
  }[];
}

export interface ShopListFilters {
  role?: string;
  ownerId?: string;
  verificationStatus?: 'pending' | 'verified' | 'rejected';
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
