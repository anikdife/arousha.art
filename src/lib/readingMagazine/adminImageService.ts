import {
  deleteObject,
  getDownloadURL,
  getMetadata,
  ref,
  uploadBytes,
} from 'firebase/storage';
import { auth, storage } from '../../firebase/firebase';
import type { RMImageEntry, RMImagesManifest } from './adminTypes';
import { rmImageFilePath } from './adminStoragePaths';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const MAX_BYTES = 1.5 * 1024 * 1024;

async function ensureAuthTokenReady(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  try {
    await user.getIdToken();
  } catch {
    // ignore
  }
}

function extForType(contentType: string): string {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return 'jpg';
}

export function validateUploadFile(file: File): { ok: true } | { ok: false; message: string } {
  if (!ALLOWED_TYPES.has(file.type)) return { ok: false, message: 'Only jpg/jpeg/png/webp images are allowed.' };
  if (file.size > MAX_BYTES) return { ok: false, message: 'Max file size is 1.5MB.' };
  return { ok: true };
}

export async function uploadCaptionImage(params: {
  storyId: string;
  captionIndex: number;
  file: File;
  existingManifest: RMImagesManifest;
}): Promise<{ manifest: RMImagesManifest; uploaded: RMImageEntry } | { error: string }> {
  const v = validateUploadFile(params.file);
  if (!v.ok) return { error: v.message };

  await ensureAuthTokenReady();

  const imageId = `img-${Date.now()}`;
  const ext = extForType(params.file.type);
  const filename = `${imageId}.${ext}`;
  const storagePath = rmImageFilePath(params.storyId, filename);

  try {
    await uploadBytes(ref(storage, storagePath), params.file, {
      contentType: params.file.type,
    });

    const now = new Date().toISOString();
    const entry: RMImageEntry = {
      imageId,
      captionIndex: params.captionIndex,
      filename,
      contentType: params.file.type,
      storagePath,
      updatedAt: now,
    };

    // Replace any existing mapping for that captionIndex
    const without = (params.existingManifest.images ?? []).filter((i) => i.captionIndex !== params.captionIndex);
    const next: RMImagesManifest = { storyId: params.storyId, images: [...without, entry] };

    return { manifest: next, uploaded: entry };
  } catch (e: any) {
    return { error: String(e?.message ?? e) };
  }
}

export async function removeCaptionImage(params: {
  storyId: string;
  captionIndex: number;
  existingManifest: RMImagesManifest;
  deleteFile: boolean;
}): Promise<{ manifest: RMImagesManifest } | { error: string }> {
  const existing = (params.existingManifest.images ?? []).find((i) => i.captionIndex === params.captionIndex);

  try {
    if (params.deleteFile && existing?.storagePath) {
      await ensureAuthTokenReady();
      await deleteObject(ref(storage, existing.storagePath));
    }

    const next: RMImagesManifest = {
      storyId: params.storyId,
      images: (params.existingManifest.images ?? []).filter((i) => i.captionIndex !== params.captionIndex),
    };

    return { manifest: next };
  } catch (e: any) {
    return { error: String(e?.message ?? e) };
  }
}

export async function getImagePreviewUrl(storagePath: string): Promise<string | null> {
  try {
    await ensureAuthTokenReady();
    return await getDownloadURL(ref(storage, storagePath));
  } catch {
    return null;
  }
}

export async function imagePathExists(storagePath: string): Promise<boolean> {
  try {
    await ensureAuthTokenReady();
    await getMetadata(ref(storage, storagePath));
    return true;
  } catch {
    return false;
  }
}
