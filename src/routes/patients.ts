import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole, requirePermission } from '../middleware/auth';
import { generateInviteToken, INVITE_EXPIRATION_MS } from '../lib/tokens';
import { asyncHandler } from '../lib/asyncHandler';
import { isNotFoundError } from '../lib/prismaErrors';

const router = Router();

router.use(requireAuth, requireRole('ADMIN', 'EMPLOYEE'));

function buildInviteLink(token: string) {
  // FRONTEND_URL pode ser uma lista separada por vírgula (ver CORS em app.ts) —
  // o link de convite usa sempre a primeira, que deve ser a URL "canônica" do site.
  const base = (process.env.FRONTEND_URL ?? 'http://localhost:3000')
    .split(',')[0]
    .trim()
    .replace(/\/+$/, '');
  return `${base}/ativar-conta?token=${token}`;
}

router.get(
  '/',
  requirePermission('patients', 'view'),
  asyncHandler(async (req, res) => {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const patients = await prisma.patient.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              { cpf: { contains: search } },
            ],
          }
        : undefined,
      orderBy: { name: 'asc' },
      include: { user: { select: { email: true, active: true, passwordHash: true } } },
    });

    return res.json(
      patients.map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        cpf: p.cpf,
        phone: p.phone,
        birthDate: p.birthDate,
        address: p.address,
        notes: p.notes,
        portalActive: Boolean(p.user?.passwordHash),
        createdAt: p.createdAt,
      })),
    );
  }),
);

router.get(
  '/:id',
  requirePermission('patients', 'view'),
  asyncHandler(async (req, res) => {
    const patient = await prisma.patient.findUnique({
      where: { id: req.params.id },
      include: {
        appointments: { orderBy: { date: 'desc' }, include: { staff: { select: { name: true } } } },
        exams: { orderBy: { date: 'desc' }, include: { staff: { select: { name: true } } } },
        user: { select: { email: true, passwordHash: true } },
      },
    });
    if (!patient) return res.status(404).json({ error: 'Paciente não encontrado' });

    return res.json({
      ...patient,
      portalActive: Boolean(patient.user?.passwordHash),
    });
  }),
);

const createPatientSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(8),
  cpf: z.string().optional(),
  birthDate: z.string().optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
});

router.post(
  '/',
  requirePermission('patients', 'edit'),
  asyncHandler(async (req, res) => {
    const parsed = createPatientSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }
    const data = parsed.data;

    const existingEmail = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (existingEmail) {
      return res.status(409).json({ error: 'Já existe uma conta com este email' });
    }

    const inviteToken = generateInviteToken();
    const inviteTokenExpiresAt = new Date(Date.now() + INVITE_EXPIRATION_MS);

    const patient = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: data.email.toLowerCase(), role: 'PATIENT' },
      });
      return tx.patient.create({
        data: {
          userId: user.id,
          name: data.name,
          email: data.email.toLowerCase(),
          phone: data.phone,
          cpf: data.cpf || undefined,
          birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
          address: data.address,
          notes: data.notes,
          inviteToken,
          inviteTokenExpiresAt,
        },
      });
    });

    return res.status(201).json({ patient, inviteLink: buildInviteLink(inviteToken) });
  }),
);

const updatePatientSchema = createPatientSchema.partial();

router.put(
  '/:id',
  requirePermission('patients', 'edit'),
  asyncHandler(async (req, res) => {
    const parsed = updatePatientSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }
    const data = parsed.data;
    try {
      const patient = await prisma.patient.update({
        where: { id: req.params.id },
        data: {
          name: data.name,
          phone: data.phone,
          cpf: data.cpf,
          birthDate: data.birthDate ? new Date(data.birthDate) : undefined,
          address: data.address,
          notes: data.notes,
        },
      });
      return res.json(patient);
    } catch (err) {
      if (isNotFoundError(err)) return res.status(404).json({ error: 'Paciente não encontrado' });
      throw err;
    }
  }),
);

router.delete(
  '/:id',
  requirePermission('patients', 'edit'),
  asyncHandler(async (req, res) => {
    try {
      await prisma.patient.delete({ where: { id: req.params.id } });
      return res.json({ ok: true });
    } catch (err) {
      if (isNotFoundError(err)) return res.status(404).json({ error: 'Paciente não encontrado' });
      throw err;
    }
  }),
);

router.post(
  '/:id/invite/resend',
  requirePermission('patients', 'edit'),
  asyncHandler(async (req, res) => {
    const inviteToken = generateInviteToken();
    const inviteTokenExpiresAt = new Date(Date.now() + INVITE_EXPIRATION_MS);
    try {
      await prisma.patient.update({
        where: { id: req.params.id },
        data: { inviteToken, inviteTokenExpiresAt },
      });
      return res.json({ inviteLink: buildInviteLink(inviteToken) });
    } catch (err) {
      if (isNotFoundError(err)) return res.status(404).json({ error: 'Paciente não encontrado' });
      throw err;
    }
  }),
);

export default router;
