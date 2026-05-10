export const animalCategories = ["개", "고양이", "조류", "설치류", "파충류", "기타"] as const;
export const animalGenders = ["수컷", "암컷", "미상"] as const;
export const neuteredOptions = ["O", "X", "미상"] as const;
export const animalStatuses = ["공고중", "완료"] as const;

export type AnimalCategory = (typeof animalCategories)[number];
export type AnimalGender = (typeof animalGenders)[number];
export type NeuteredOption = (typeof neuteredOptions)[number];
export type AnimalStatus = (typeof animalStatuses)[number];

export type AnimalSearchParams = {
  from?: string;
  to?: string;
  region?: string;
  category?: string;
  breed?: string;
  gender?: string;
  neutered?: string;
  keywords?: string;
  page?: number;
  limit?: number;
};

export type AnimalWithShelter = {
  id: number;
  sourceSite: string;
  noticeNo: string;
  status: string;
  category: string;
  breed: string;
  gender: string;
  neutered: string;
  foundLocation: string;
  foundRegion: string;
  foundDate: string;
  noticeStartAt: string | null;
  noticeEndAt: string | null;
  features: string;
  imageUrl: string;
  imageGallery: string;
  detailUrl: string;
  shelter: {
    id: number;
    name: string;
    phone: string;
    address: string;
    website: string;
  };
};
