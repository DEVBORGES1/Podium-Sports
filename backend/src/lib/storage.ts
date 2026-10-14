import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';
import { AppError, badRequest } from './errors.js';

export type MediaFolder = 'products' | 'categories' | 'banners' | 'store';

export interface StorageProvider {
  upload(path: string, data: Buffer, contentType: string): Promise<void>;
  download(path: string): Promise<Buffer>;
  remove(paths: string[]): Promise<void>;
  publicUrl(path: string): string;
}

const ALLOWED: Record<string, { ext: string; check: (b: Buffer) => boolean }> = {
  'image/jpeg': { ext: 'jpg', check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': {
    ext: 'png',
    check: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  'image/webp': {
    ext: 'webp',
    check: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
};

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Identifica o tipo real do arquivo pelos bytes iniciais (não confia na extensão nem no Content-Type). */
export function detectImageType(data: Buffer): { mime: string; ext: string } | null {
  for (const [mime, { ext, check }] of Object.entries(ALLOWED)) {
    if (data.length > 12 && check(data)) return { mime, ext };
  }
  return null;
}

export function validateImage(data: Buffer) {
  if (data.length === 0) throw badRequest('Arquivo vazio.');
  if (data.length > MAX_UPLOAD_BYTES) throw new AppError(413, 'FILE_TOO_LARGE', 'A imagem deve ter no máximo 5 MB.');
  const type = detectImageType(data);
  if (!type) throw new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Envie uma imagem JPG, PNG ou WEBP válida.');
  return type;
}

/** Nome gerado pelo servidor: nunca usa o nome enviado pelo usuário. */
export function buildStoragePath(folder: MediaFolder, ext: string) {
  return `${folder}/${randomUUID()}.${ext}`;
}

export const STORAGE_PATH_REGEX = /^(products|categories|banners|store)\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

class SupabaseStorage implements StorageProvider {
  private client;
  constructor(
    private url: string,
    key: string,
    private bucket: string,
  ) {
    this.client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  async upload(path: string, data: Buffer, contentType: string) {
    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(path, data, { contentType, cacheControl: '31536000', upsert: false });
    if (error) throw new AppError(502, 'STORAGE_ERROR', 'Falha ao enviar a imagem para o armazenamento.');
  }
  async download(path: string) {
    const { data, error } = await this.client.storage.from(this.bucket).download(path);
    if (error || !data) throw new AppError(502, 'STORAGE_ERROR', 'Falha ao ler a imagem do armazenamento.');
    return Buffer.from(await data.arrayBuffer());
  }
  async remove(paths: string[]) {
    if (paths.length === 0) return;
    const { error } = await this.client.storage.from(this.bucket).remove(paths);
    if (error) throw new AppError(502, 'STORAGE_ERROR', 'Falha ao remover a imagem do armazenamento.');
  }
  publicUrl(path: string) {
    return `${this.url.replace(/\/$/, '')}/storage/v1/object/public/${this.bucket}/${path}`;
  }
}

/** Implementação em memória, usada nos testes. */
export class MemoryStorage implements StorageProvider {
  files = new Map<string, { data: Buffer; contentType: string }>();
  async upload(path: string, data: Buffer, contentType: string) {
    this.files.set(path, { data, contentType });
  }
  async download(path: string) {
    const file = this.files.get(path);
    if (!file) throw new AppError(502, 'STORAGE_ERROR', 'Falha ao ler a imagem do armazenamento.');
    return file.data;
  }
  async remove(paths: string[]) {
    paths.forEach((p) => this.files.delete(p));
  }
  publicUrl(path: string) {
    return `https://storage.test/${path}`;
  }
}

class UnconfiguredStorage implements StorageProvider {
  private fail(): never {
    throw new AppError(503, 'STORAGE_NOT_CONFIGURED', 'Armazenamento de imagens não configurado (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY).');
  }
  async upload() {
    this.fail();
  }
  async download(): Promise<Buffer> {
    this.fail();
  }
  async remove() {
    this.fail();
  }
  publicUrl(path: string) {
    return env.SUPABASE_URL
      ? `${env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/${env.STORAGE_BUCKET}/${path}`
      : `/media-not-configured/${path}`;
  }
}

let provider: StorageProvider =
  env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
    ? new SupabaseStorage(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env.STORAGE_BUCKET)
    : new UnconfiguredStorage();

export const storage = {
  get: () => provider,
  set: (p: StorageProvider) => {
    provider = p;
  },
};

export const mediaUrl = (path: string | null | undefined) => (path ? storage.get().publicUrl(path) : null);
