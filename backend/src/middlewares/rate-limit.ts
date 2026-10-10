import rateLimit, { type Options } from 'express-rate-limit';

const handler: Options['handler'] = (req, res, _next, options) => {
  res.status(options.statusCode).json({
    error: { code: 'RATE_LIMITED', message: 'Muitas requisições. Aguarde alguns instantes e tente novamente.', requestId: req.id },
  });
};

export function limiter(windowMs: number, limit: number) {
  return rateLimit({ windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false, handler });
}
