import { getBytes, ref } from 'firebase/storage';
import { auth, storage } from '../../firebase/firebase';

export type WritingPromptType = 'persuasive' | 'narrative' | 'imaginative';

export type WritingIndexItemY3 = {
  promptId: string;
  title: string;
  type: WritingPromptType;
  jsonPath: string;
  imagePath: string;
};

export type WritingIndexY3 = {
  version: number;
  updatedAt: string;
  items: WritingIndexItemY3[];
};

export const WRITING_Y3_INDEX_PATH = 'writingPrompts/y3/index.json';

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

export async function loadWritingIndexY3(): Promise<WritingIndexY3> {
  await ensureAuthTokenReady();

  try {
    const bytes = await getBytes(ref(storage, WRITING_Y3_INDEX_PATH));
    const text = decodeUtf8(bytes);
    const parsed = JSON.parse(text) as WritingIndexY3;
    const items = Array.isArray((parsed as any)?.items) ? ((parsed as any).items as any[]) : [];

    return {
      version: typeof (parsed as any)?.version === 'number' ? (parsed as any).version : 1,
      updatedAt: typeof (parsed as any)?.updatedAt === 'string' ? (parsed as any).updatedAt : new Date().toISOString(),
      items: items
        .map((it) => {
          const promptId = typeof it?.promptId === 'string' ? it.promptId : '';
          const title = typeof it?.title === 'string' ? it.title : '';
          const type = it?.type === 'persuasive' || it?.type === 'narrative' || it?.type === 'imaginative' ? (it.type as WritingPromptType) : 'narrative';
          const jsonPath = typeof it?.jsonPath === 'string' ? it.jsonPath : '';
          const imagePath = typeof it?.imagePath === 'string' ? it.imagePath : '';
          return { promptId, title, type, jsonPath, imagePath } satisfies WritingIndexItemY3;
        })
        .filter((it) => Boolean(it.promptId) && Boolean(it.jsonPath) && Boolean(it.imagePath)),
    };
  } catch {
    return { version: 1, updatedAt: new Date().toISOString(), items: [] };
  }
}
