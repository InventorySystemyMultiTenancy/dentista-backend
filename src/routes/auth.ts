import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { signToken, cookieOptions, COOKIE_NAME } from '../lib/jwt';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    include: { staff: true, patient: true },
  });

  if (!user || !user.active || !user.passwordHash) {
    return res.status(401).json({ error: 'Credenciais inválidas ou conta ainda não ativada' });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const token = signToken({
    userId: user.id,
    role: user.role,
    staffId: user.staff?.id,
    patientId: user.patient?.id,
  });

  res.cookie(COOKIE_NAME, token, cookieOptions());

  return res.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.staff?.name ?? user.patient?.name ?? null,
    },
  });
}));

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
  return res.json({ ok: true });
});

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.auth!.userId },
    include: { staff: true, patient: true },
  });
  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado' });
  }
  return res.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.staff?.name ?? user.patient?.name ?? null,
      staffId: user.staff?.id ?? null,
      patientId: user.patient?.id ?? null,
      permissions: user.staff?.permissions ?? null,
    },
  });
}));

const acceptInviteSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6, 'A senha deve ter pelo menos 6 caracteres'),
});

router.post('/invite/accept', asyncHandler(async (req, res) => {
  const parsed = acceptInviteSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
  }
  const { token, password } = parsed.data;

  const patient = await prisma.patient.findUnique({ where: { inviteToken: token } });
  if (!patient || !patient.inviteTokenExpiresAt || patient.inviteTokenExpiresAt < new Date()) {
    return res.status(400).json({ error: 'Convite inválido ou expirado' });
  }
  if (!patient.userId) {
    return res.status(400).json({ error: 'Convite inválido' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: patient.userId }, data: { passwordHash } }),
    prisma.patient.update({
      where: { id: patient.id },
      data: { inviteToken: null, inviteTokenExpiresAt: null },
    }),
  ]);

  return res.json({ ok: true });
}));

export default router;
