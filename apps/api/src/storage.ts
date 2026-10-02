import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

/** Detecta o tipo pela assinatura do arquivo (não confia no Content-Type do cliente). */
export function sniffImage(buf: Buffer): ImageMime | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return null;
}

const EXT: Record<ImageMime, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/**
 * Arquivos ficam FORA de qualquer diretório público, em data/uploads/<userId>/<kind>/,
 * com nome aleatório. Só são servidos por rota autenticada que confere o dono.
 */
export class PhotoStorage {
  constructor(private baseDir: string) {}

  save(userId: number, kind: 'meals' | 'progress', buf: Buffer, mime: ImageMime): string {
    const dir = path.join(this.baseDir, String(userId), kind);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const name = `${crypto.randomUUID()}.${EXT[mime]}`;
    fs.writeFileSync(path.join(dir, name), buf, { mode: 0o600 });
    return name;
  }

  path(userId: number, kind: 'meals' | 'progress', fileName: string): string {
    if (!/^[\w-]+\.(jpg|png|webp)$/.test(fileName)) throw new Error('Nome de arquivo inválido');
    return path.join(this.baseDir, String(userId), kind, fileName);
  }

  remove(userId: number, kind: 'meals' | 'progress', fileName: string) {
    try {
      fs.unlinkSync(this.path(userId, kind, fileName));
    } catch {
      /* já removido */
    }
  }
}
