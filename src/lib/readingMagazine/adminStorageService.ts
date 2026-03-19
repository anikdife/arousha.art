import {
  deleteObject,
  getBytes,
  listAll,
  ref,
  uploadBytes,
} from 'firebase/storage';
import { auth, storage } from '../../firebase/firebase';
import type { RMImagesManifest, RMQuestionSet, RMStory } from './adminTypes';
import {
  rmImagesManifestPath,
  rmIndexPath,
  rmMetaPath,
  rmQuestionsJsonPath,
  rmStoryFolder,
  rmStoryJsonPath,
} from './adminStoragePaths';
import type { RMAdminMeta, RMIndex } from './adminTypes';

function decodeUtf8(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    return new TextDecoder('utf-8').decode(view);
  } catch {
    let out = '';
    for (let i = 0; i < view.length; i++) out += String.fromCharCode(view[i]);
    return out;
  }
}

async function ensureAuthTokenReady(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await user.getIdToken();
  } catch {
    // ignore
  }
}

async function downloadJson<T>(path: string): Promise<T> {
  await ensureAuthTokenReady();
  const bytes = await getBytes(ref(storage, path));
  const text = decodeUtf8(bytes);
  return JSON.parse(text) as T;
}

async function uploadJson(path: string, value: unknown): Promise<void> {
  await ensureAuthTokenReady();
  const payload = JSON.stringify(value, null, 2);
  const bytes = new TextEncoder().encode(payload);
  await uploadBytes(ref(storage, path), bytes, {
    contentType: 'application/json; charset=utf-8',
  });
}

export async function loadRmMeta(): Promise<RMAdminMeta> {
  try {
    return await downloadJson<RMAdminMeta>(rmMetaPath());
  } catch {
    // default meta if missing
    return { version: 1, updatedAt: new Date().toISOString(), updatedByUid: '', published: false };
  }
}

export async function loadRmIndex(): Promise<RMIndex> {
  try {
    return await downloadJson<RMIndex>(rmIndexPath());
  } catch {
    return { version: 1, stories: [] };
  }
}

export async function saveRmMeta(meta: RMAdminMeta): Promise<void> {
  await uploadJson(rmMetaPath(), meta);
}

export async function saveRmIndex(index: RMIndex): Promise<void> {
  await uploadJson(rmIndexPath(), index);
}

export async function loadRmStory(storyId: string): Promise<RMStory> {
  return downloadJson<RMStory>(rmStoryJsonPath(storyId));
}

export async function saveRmStory(storyId: string, story: RMStory): Promise<void> {
  await uploadJson(rmStoryJsonPath(storyId), story);
}

export async function loadRmQuestions(storyId: string): Promise<RMQuestionSet> {
  return downloadJson<RMQuestionSet>(rmQuestionsJsonPath(storyId));
}

export async function saveRmQuestions(storyId: string, questions: RMQuestionSet): Promise<void> {
  await uploadJson(rmQuestionsJsonPath(storyId), questions);
}

export async function loadRmImagesManifest(storyId: string): Promise<RMImagesManifest> {
  try {
    return await downloadJson<RMImagesManifest>(rmImagesManifestPath(storyId));
  } catch {
    return { storyId, images: [] };
  }
}

export async function saveRmImagesManifest(storyId: string, manifest: RMImagesManifest): Promise<void> {
  await uploadJson(rmImagesManifestPath(storyId), manifest);
}

export async function createRmStoryAssets(params: {
  storyId: string;
  uid: string;
  metaVersion: number;
  title: string;
}): Promise<void> {
  const computeWordCount = (text: string, headings: Array<{ heading?: string; text?: string }>): number => {
    const pieces: string[] = [];
    pieces.push(text ?? '');
    for (const h of headings ?? []) {
      pieces.push(h.heading ?? '');
      pieces.push(h.text ?? '');
    }
    const all = pieces.join(' ').trim();
    if (!all) return 0;
    return all.split(/\s+/).filter(Boolean).length;
  };

  const story: RMStory = {
    id: params.storyId,
    year: 3,
    type: 'narrative',
    title: params.title,
    wordCount: 0,
    text: 'Paragraph 1.\n\nParagraph 2.\n\nParagraph 3.',
    headings: [],
    captions: [],
  };
  story.wordCount = computeWordCount(story.text, story.headings);

  const questions: RMQuestionSet = {
    storyId: params.storyId,
    year: 3,
    version: params.metaVersion,
    questions: [],
  };

  const images: RMImagesManifest = {
    storyId: params.storyId,
    images: [],
  };

  await Promise.all([
    uploadJson(rmStoryJsonPath(params.storyId), story),
    uploadJson(rmQuestionsJsonPath(params.storyId), questions),
    uploadJson(rmImagesManifestPath(params.storyId), images),
  ]);
}

export async function deleteRmStoryFolder(storyId: string): Promise<void> {
  await ensureAuthTokenReady();
  const folderRef = ref(storage, rmStoryFolder(storyId));
  const listing = await listAll(folderRef);

  // Delete top-level files
  await Promise.all(listing.items.map((item) => deleteObject(item)));

  // Delete nested folders (images/)
  for (const prefix of listing.prefixes) {
    const nested = await listAll(prefix);
    await Promise.all(nested.items.map((item) => deleteObject(item)));
  }
}

export async function optimisticCheckMetaVersion(expectedVersion: number): Promise<{ ok: true } | { ok: false; currentVersion: number }>
{
  const current = await loadRmMeta();
  if (current.version !== expectedVersion) return { ok: false, currentVersion: current.version };
  return { ok: true };
}

export async function publishRmStory(params: {
  storyId: string;
  uid: string;
  loadedMetaVersion: number;
  nextMetaPublished: boolean;
  index: RMIndex;
  story: RMStory;
  questions: RMQuestionSet;
  hasImages: boolean;
  hasQuestions: boolean;
}): Promise<{ newVersion: number } | { conflictVersion: number }> {
  const check = await optimisticCheckMetaVersion(params.loadedMetaVersion);
  if (!check.ok) return { conflictVersion: check.currentVersion };

  const now = new Date().toISOString();
  const newVersion = params.loadedMetaVersion + 1;

  // Update questions version at publish time
  const questions: RMQuestionSet = {
    ...params.questions,
    storyId: params.storyId,
    year: 3,
    version: newVersion,
  };

  const index: RMIndex = {
    version: newVersion,
    stories: params.index.stories.map((s) => {
      if (s.storyId !== params.storyId) return s;
      return {
        ...s,
        title: params.story.title,
        type: params.story.type,
        wordCount: params.story.wordCount,
        status: 'published',
        hasImages: params.hasImages,
        hasQuestions: params.hasQuestions,
        updatedAt: now,
        updatedByUid: params.uid,
      };
    }),
  };

  const meta: RMAdminMeta = {
    version: newVersion,
    updatedAt: now,
    updatedByUid: params.uid,
    published: params.nextMetaPublished,
  };

  await Promise.all([
    saveRmStory(params.storyId, params.story),
    saveRmQuestions(params.storyId, questions),
    saveRmIndex(index),
    saveRmMeta(meta),
  ]);

  return { newVersion };
}
