export interface SupplementSection {
  heading: string;
  content: string;
}

export interface SupplementAnalysisResult {
  analysisText: string;
  sections: SupplementSection[];
  infographicImageDataUrl: string;
}

export interface PickedSupplementAsset {
  uri: string;
  width?: number | null;
  height?: number | null;
  fileName?: string | null;
  mimeType?: string | null;
  file?: File;
}

export type RequestApi = (path: string, init?: RequestInit, timeoutMsOverride?: number) => Promise<Response>;
