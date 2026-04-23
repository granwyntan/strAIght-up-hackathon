export interface SupplementSection {
  heading: string;
  content: string;
}

export interface SupplementEvidenceItem {
  id: string;
  ingredient_id: string;
  study_type: string;
  strength: string;
  summary: string;
  source_link: string;
}

export interface SupplementInteractionItem {
  ingredient_id: string;
  interacts_with: string;
  severity: string;
  description: string;
}

export interface SupplementIngredientAnalysisScores {
  effectiveness_score: number;
  safety_score: number;
  compatibility_score: number;
}

export interface SupplementIngredientDetail {
  id: string;
  name: string;
  category: string;
  description: string;
  amount?: string;
  dose_assessment?: string;
  evidence: SupplementEvidenceItem[];
  interactions: SupplementInteractionItem[];
  personal_relevance?: string;
  analysis_result: SupplementIngredientAnalysisScores;
}

export interface SupplementUserProfileSnapshot {
  age: string;
  gender: string;
  conditions: string[];
  medications: string[];
}

export interface SupplementStructuredAnalysis {
  ingredients: SupplementIngredientDetail[];
  user_profile: SupplementUserProfileSnapshot;
  analysis_result: SupplementIngredientAnalysisScores;
}

export interface SupplementAnalysisResult {
  analysisText: string;
  sections: SupplementSection[];
  infographicImageDataUrl: string;
  detectedDrugs?: string[];
  structuredAnalysis?: SupplementStructuredAnalysis | null;
  generationTiming?: {
    textStartedAt?: number | null;
    textCompletedAt?: number | null;
    imageStartedAt?: number | null;
    imageCompletedAt?: number | null;
  } | null;
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
