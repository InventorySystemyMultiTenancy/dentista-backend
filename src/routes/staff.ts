import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

router.use(requireAuth, requireRole('ADMIN', 'EMPLOYEE'));

// Lista enxuta (id + nome) usada para preencher seletores de profissional na agenda/exames.
// Disponível para qualquer membro da equipe autenticado, sem exigir permissão de "employees".
router.get(
  '/directory',
  asyncHandler(async (_req, res) => {
    const staff = await prisma.staff.findMany({
      where: { user: { active: true } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, position: true },
    });
    return res.json(staff);
  }),
);

// Gestão de funcionários e permissões é restrita ao ADMIN (dono/dentista responsável).
router.use(requireRole('ADMIN'));

const permissionsSchema = z.record(
  z.string(),
  z.object({ view: z.boolean().default(false), edit: z.boolean().default(false) }),
);

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const staff = await prisma.staff.findMany({
      orderBy: { name: 'asc' },
      include: { user: { select: { email: true, active: true } } },
    });
    return res.json(
      staff.map((s) => ({
        id: s.id,
        name: s.name,
        phone: s.phone,
        position: s.position,
        permissions: s.permissions,
        email: s.user.email,
        active: s.user.active,
        createdAt: s.createdAt,
      })),
    );
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const staff = await prisma.staff.findUnique({
      where: { id: req.params.id },
      include: { user: { select: { email: true, active: true } } },
    });
    if (!staff) return res.status(404).json({ error: 'Funcionário não encontrado' });
    return res.json(staff);
  }),
);

const createStaffSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().optional(),
  position: z.string().optional(),
  role: z.enum(['ADMIN', 'EMPLOYEE']).default('EMPLOYEE'),
  permissions: permissionsSchema.optional(),
});

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createStaffSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }
    const data = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (existing) {
      return res.status(409).json({ error: 'Já existe uma conta com este email' });
    }

    const passwordHash = await bcrypt.hash(data.password, 10);
    const staff = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: data.email.toLowerCase(), passwordHash, role: data.role },
      });
      return tx.staff.create({
        data: {
          userId: user.id,
          name: data.name,
          phone: data.phone,
          position: data.position,
          permissions: data.permissions ?? {},
        },
      });
    });

    return res.status(201).json(staff);
  }),
);

const updateStaffSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().optional(),
  position: z.string().optional(),
  permissions: permissionsSchema.optional(),
  active: z.boolean().optional(),
});

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const parsed = updateStaffSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }
    const data = parsed.data;

    const staff = await prisma.staff.findUnique({ where: { id: req.params.id } });
    if (!staff) return res.status(404).json({ error: 'Funcionário não encontrado' });

    const updated = await prisma.$transaction(async (tx) => {
      if (data.active !== undefined) {
        await tx.user.update({ where: { id: staff.userId }, data: { active: data.active } });
      }
      return tx.staff.update({
        where: { id: req.params.id },
        data: {
          name: data.name,
          phone: data.phone,
          position: data.position,
          permissions: data.permissions,
        },
      });
    });

    return res.json(updated);
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const staff = await prisma.staff.findUnique({ where: { id: req.params.id } });
    if (!staff) return res.status(404).json({ error: 'Funcionário não encontrado' });
    // Desativa em vez de apagar, para preservar histórico de agendamentos/exames/lançamentos vinculados.
    await prisma.user.update({ where: { id: staff.userId }, data: { active: false } });
    return res.json({ ok: true });
  }),
);

export default router;
