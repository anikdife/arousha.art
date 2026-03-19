import { getBytes, ref } from 'firebase/storage';
import { storage } from '../../firebase/firebase';
import type { LCQuestion } from './types';
import { parseLcBankJsonTextStrict } from './bank';

export const LC_BANK_STORAGE_PATH = 'banks/languageConventions/bank.data.json';

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

export async function fetchLcBankJsonTextFromStorage(): Promise<string> {
  const bytes = await getBytes(ref(storage, LC_BANK_STORAGE_PATH));
  return decodeUtf8(bytes);
}

export async function fetchLcBankFromStorageStrict(): Promise<LCQuestion[]> {
  const text = await fetchLcBankJsonTextFromStorage();
  return parseLcBankJsonTextStrict(text);
}
