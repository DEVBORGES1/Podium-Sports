import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { formatIssues } from '../lib/validation.js';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada.', requestId: req.id } });
};

/** Converte qualquer erro em uma resposta JSON padronizada, sem vazar detalhes internos. */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Erro interno. Tente novamente em instantes.';
  let details: unknown;

  if (err instanceof AppError) {
    ({ status, code, message, details } = err);
  } else if (err instanceof ZodError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Dados inválidos.';
    details = formatIssues(err);
  } else if (err instanceof multer.MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    code = err.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'UPLOAD_ERROR';
    message = err.code === 'LIMIT_FILE_SIZE' ? 'A imagem deve ter no máximo 5 MB.' : 'Envio de arquivo inválido.';
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      status = 409;
      code = 'DUPLICATE';
      message = 'Já existe um registro com estes dados.';
      details = { fields: err.meta?.target };
    } else if (err.code === 'P2025') {
      status = 404;
      code = 'NOT_FOUND';
      message = 'Recurso não encontrado.';
    } else if (err.code === 'P2003') {
      status = 409;
      code = 'IN_USE';
      message = 'Registro vinculado a outros dados.';
    }
  } else if (typeof err === 'object' && err && 'type' in err) {
    const type = (err as { type?: string }).type;
    if (type === 'entity.parse.failed') {
      status = 400;
      code = 'INVALID_JSON';
      message = 'JSON inválido.';
    } else if (type === 'entity.too.large') {
      status = 413;
      code = 'PAYLOAD_TOO_LARGE';
      message = 'Requisição muito grande.';
    }
  }

  if (status >= 500) req.log?.error({ err }, 'unhandled error');
  else req.log?.debug({ code }, 'request rejected');

  res.status(status).json({ error: { code, message, ...(details !== undefined ? { details } : {}), requestId: req.id } });
};
