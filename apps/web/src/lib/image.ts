/**
 * Redimensiona e reencoda a foto no próprio aparelho antes do envio:
 * reduz upload/custo e REMOVE metadados EXIF (incluindo GPS), já que o canvas não os copia.
 */
export async function prepareImage(file: File, maxSide = 1600, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error('Não consegui ler a imagem. Use JPEG, PNG ou WebP.');
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao processar a imagem'))), 'image/jpeg', quality));
}
