const BASE = 'adminReading/y3/reading-magazine';

export function rmBasePath(): string {
  return BASE;
}

export function rmMetaPath(): string {
  return `${BASE}/meta.json`;
}

export function rmIndexPath(): string {
  return `${BASE}/index.json`;
}

export function rmStoryFolder(storyId: string): string {
  return `${BASE}/stories/${storyId}`;
}

export function rmStoryJsonPath(storyId: string): string {
  return `${rmStoryFolder(storyId)}/story.json`;
}

export function rmQuestionsJsonPath(storyId: string): string {
  return `${rmStoryFolder(storyId)}/questions.json`;
}

export function rmImagesFolder(storyId: string): string {
  return `${rmStoryFolder(storyId)}/images`;
}

export function rmImagesManifestPath(storyId: string): string {
  return `${rmImagesFolder(storyId)}/images.json`;
}

export function rmImageFilePath(storyId: string, filename: string): string {
  return `${rmImagesFolder(storyId)}/${filename}`;
}
