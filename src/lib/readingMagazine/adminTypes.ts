export type RMTextType = 'narrative' | 'informative' | 'letter' | 'article' | 'fantasy';
export type RMStoryStatus = 'draft' | 'published';

export type RMAdminMeta = {
  version: number;
  updatedAt: string; // ISO
  updatedByUid: string;
  published: boolean;
};

export type RMIndexStory = {
  storyId: string;
  title: string;
  type: RMTextType;
  wordCount: number;
  status: RMStoryStatus;
  hasImages: boolean;
  hasQuestions: boolean;
  updatedAt: string; // ISO
  updatedByUid: string;
};

export type RMIndex = {
  version: number;
  stories: RMIndexStory[];
};

export type RMStoryHeading = { heading: string; text: string };
export type RMStoryCaption = { caption: string };

export type RMStory = {
  id: string; // equals storyId
  year: 3;
  type: RMTextType;
  title: string;
  wordCount: number;
  text: string; // paragraphs separated by "\n\n"
  headings: RMStoryHeading[]; // empty for narrative/letter
  captions: RMStoryCaption[]; // may be empty
};

export type RMImageEntry = {
  imageId: string;
  captionIndex: number; // 0-based
  filename: string;
  contentType: string;
  storagePath: string;
  updatedAt: string; // ISO
};

export type RMImagesManifest = {
  storyId: string;
  images: RMImageEntry[];
};

export type RMQuestionSkill = 'literal' | 'inferential' | 'vocabulary' | 'purpose' | 'textStructure';

export type RMQuestion = {
  id: string; // q1..qN unique
  type: 'mcq';
  skill: RMQuestionSkill;
  prompt: string;
  choices: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
};

export type RMQuestionSet = {
  storyId: string;
  year: 3;
  version: number; // equals meta version at publish time
  questions: RMQuestion[];
};

export type ValidationIssue = { level: 'error' | 'warning'; message: string };
export type ValidationResult = { ok: boolean; errors: string[]; warnings: string[] };
