import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { audit } from '../../lib/audit.js';
import { badRequest } from '../../lib/errors.js';
import { MAX_UPLOAD_BYTES, buildStoragePath, storage, validateImage } from '../../lib/storage.js';
import { parse } from '../../lib/validation.js';
import { currentProfile } from '../../middlewares/auth.js';

/** Upload em memória com limites rígidos; o conteúdo é validado pelos bytes antes de ir ao Storage. */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 8, fields: 10, fieldSize: 1024, parts: 20 },
});

export const uploadsRouter = Router();

/**
 * Upload avulso para imagens de categoria, banner e logotipo.
 * Retorna o caminho que deve ser gravado no recurso (imagePath / logoPath).
 */
uploadsRouter.post('/uploads', imageUpload.single('file'), async (req, res) => {
  const { folder } = parse(z.object({ folder: z.enum(['categories', 'banners', 'store']) }), req.query);
  if (!req.file) throw badRequest('Envie o arquivo no campo "file".');
  const type = validateImage(req.file.buffer);
  const path = buildStoragePath(folder, type.ext);
  await storage.get().upload(path, req.file.buffer, type.mime);
  await audit({
    profileId: currentProfile(req).id,
    action: 'media.upload',
    entityType: 'media',
    entityId: path,
    metadata: { folder, sizeBytes: req.file.size, mimeType: type.mime },
  });
  res.status(201).json({ path, url: storage.get().publicUrl(path) });
});
