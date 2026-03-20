export type ImageStyle = 'watercolor' | 'oil-painting' | 'pencil-sketch' | 'cyberpunk' | 'dreamy' | 'minimalist';
export type ImageProvider = 'auto' | 'gemini' | 'pollinations' | 'unsplash';

export interface Book {
  id: string;
  title: string;
  coverImageUrl?: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  style: ImageStyle;
}

export interface Poem {
  id: string;
  bookId: string;
  title: string;
  content: string;
  style: ImageStyle;
  imageUrl?: string;
  order: number;
  userId: string;
  createdAt: number;
  updatedAt?: number;
  fontSize?: 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl';
  textAlign?: 'left' | 'center' | 'right';
  fontFamily?: string;
  imageOpacity?: number;
}

export interface AppSettings {
  themeColor: string;
  defaultStyle: ImageStyle;
  defaultFontSize: 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl';
  photoOpacity: number;
  version: string;
  geminiApiKey?: string;
  imageProvider?: ImageProvider;
}

export const DEFAULT_SETTINGS: AppSettings = {
  themeColor: '#f5f5f4', // Light beige (stone-100)
  defaultStyle: 'watercolor',
  defaultFontSize: 'xl',
  photoOpacity: 0.6,
  version: '1.1.3',
  geminiApiKey: '',
  imageProvider: 'auto'
};

export const AVAILABLE_FONTS = [
  { id: 'Noto Serif KR', label: '명조체', import: 'Noto+Serif+KR:wght@300;400;700' },
  { id: 'Noto Sans KR', label: '고딕체', import: 'Noto+Sans+KR:wght@300;400;700' },
  { id: 'Nanum Myeongjo', label: '나눔명조', import: 'Nanum+Myeongjo:wght@400;700' },
  { id: 'Nanum Gothic', label: '나눔고딕', import: 'Nanum+Gothic:wght@400;700' },
  { id: 'Gowun Batang', label: '고운바탕', import: 'Gowun+Batang:wght@400;700' },
  { id: 'Gowun Dodum', label: '고운돋움', import: 'Gowun+Dodum' },
];

export const IMAGE_STYLES: { id: ImageStyle; label: string; description: string }[] = [
  { id: 'watercolor', label: '수채화', description: '부드럽고 투명한 느낌의 수채화 스타일' },
  { id: 'oil-painting', label: '유화', description: '질감이 살아있는 클래식한 유화 스타일' },
  { id: 'pencil-sketch', label: '연필 소묘', description: '섬세한 선으로 표현된 흑백 소묘 스타일' },
  { id: 'cyberpunk', label: '사이버펑크', description: '화려한 네온 사인과 미래적인 느낌' },
  { id: 'dreamy', label: '몽환적', description: '신비롭고 환상적인 분위기의 스타일' },
  { id: 'minimalist', label: '미니멀리즘', description: '절제된 색상과 단순한 형태의 미' },
];
