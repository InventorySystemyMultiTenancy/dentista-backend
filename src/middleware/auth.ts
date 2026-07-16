import { Request, Response, NextFunction } from 'express';
import { verifyToken, AuthPayload, COOKIE_NAME } from '../lib/jwt';
import { prisma } from '../lib/prisma';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  try {
    req.auth = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Sessão inválida ou expirada' });
  }
}

export function requireRole(...roles: AuthPayload['role'][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    next();
  };
}

export type PermissionModule =
  | 'patients'
  | 'agenda'
  | 'exams'
  | 'financial'
  | 'inventory'
  | 'employees';
export type PermissionAction = 'view' | 'edit';

export function requirePermission(module: PermissionModule, action: PermissionAction) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ error: 'Não autenticado' });
    }
    if (req.auth.role === 'ADMIN') {
      return next();
    }
    if (req.auth.role !== 'EMPLOYEE' || !req.auth.staffId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    try {
      const staff = await prisma.staff.findUnique({ where: { id: req.auth.staffId } });
      const permissions = (staff?.permissions as any) ?? {};
      if (permissions?.[module]?.[action]) {
        return next();
      }
      return res.status(403).json({ error: 'Sem permissão para esta ação' });
    } catch (err) {
      next(err);
    }
  };
}

export function requirePatient(req: Request, res: Response, next: NextFunction) {
  if (!req.auth || req.auth.role !== 'PATIENT' || !req.auth.patientId) {
    return res.status(403).json({ error: 'Acesso negado' });
  }
  next();
}
