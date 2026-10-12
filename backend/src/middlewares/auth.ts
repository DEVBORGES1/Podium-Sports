import type { NextFunction, Request, Response } from 'express';
import { createRemoteJWKSet, decodeJwt, decodeProtectedHeader, jwtVerify, type JWTPayload } from 'jose';
import type { Profile, UserRole } from '@prisma/client';
import { env } from '../config/env.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../lib/prisma.js';

declare module 'express-serve-static-core' {
  interface Request {
    profile?: Profile;
  }
}

const issuer = env.SUPABASE_URL ? `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1` : undefined;
const jwks = issuer ? createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`)) : null;
const hsSecret = env.SUPABASE_JWT_SECRET ? new TextEncoder().encode(env.SUPABASE_JWT_SECRET) : null;

/**
 * Valida o access token emitido pelo Supabase Auth:
 * assinatura (JWKS assimétrico ou segredo HS256 legado), emissor, audiência e expiração.
 */
export async function verifyAccessToken(token: string): Promise<JWTPayload & { sub: string }> {
  let alg: string | undefined;
  try {
    alg = decodeProtectedHeader(token).alg;
  } catch {
    throw unauthorized('Token inválido.');
  }
  const options = { audience: 'authenticated', ...(issuer ? { issuer } : {}), clockTolerance: 5 };
  let payload: JWTPayload;
  try {
    if (alg === 'HS256') {
      if (!hsSecret) throw new Error('token HS256 recebido, mas SUPABASE_JWT_SECRET não está configurado');
      ({ payload } = await jwtVerify(token, hsSecret, { ...options, algorithms: ['HS256'] }));
    } else {
      if (!jwks) throw new Error('SUPABASE_URL não configurado (JWKS indisponível)');
      ({ payload } = await jwtVerify(token, jwks, { ...options, algorithms: ['ES256', 'RS256'] }));
    }
  } catch (err) {
    const e = err as { code?: string; claim?: string; message?: string };
    if (e.code === 'ERR_JWT_EXPIRED') throw unauthorized('Sessão expirada. Entre novamente.');
    // Diagnóstico de configuração: registra o motivo e os emissores (nunca o token).
    let tokenIssuer: unknown;
    try {
      tokenIssuer = decodeJwt(token).iss;
    } catch {
      tokenIssuer = undefined;
    }
    logger.warn({ alg, code: e.code, claim: e.claim, reason: e.message, expectedIssuer: issuer, tokenIssuer }, 'access token rejected');
    throw unauthorized('Token inválido.');
  }
  if (typeof payload.sub !== 'string' || !payload.sub) throw unauthorized('Token inválido.');
  return payload as JWTPayload & { sub: string };
}

function bearer(req: Request) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 && token.length < 8192 ? token : null;
}

/** Exige um administrador ativo. O perfil é consultado a cada requisição: desativar tem efeito imediato. */
export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  const token = bearer(req);
  if (!token) throw unauthorized();
  const payload = await verifyAccessToken(token);
  const profile = await prisma.profile.findUnique({ where: { authUserId: payload.sub } });
  if (!profile) throw forbidden('Esta conta não possui acesso administrativo.');
  if (profile.status !== 'ACTIVE') throw forbidden('Conta administrativa desativada.');
  req.profile = profile;
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.profile) throw unauthorized();
    if (!roles.includes(req.profile.role)) throw forbidden();
    next();
  };
}

export function currentProfile(req: Request): Profile {
  if (!req.profile) throw unauthorized();
  return req.profile;
}
