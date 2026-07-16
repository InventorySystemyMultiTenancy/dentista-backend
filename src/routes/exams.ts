import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { isNotFoundError } from '../lib/prismaErrors';

const router = Router();

router.use(requireAuth, requireRole('ADMIN', 'EMPLOYEE'));

router.get(
  '/stats',
  requirePermission('exams', 'view'),
  asyncHandler(async (req, res) => {
    const { patientId } = req.query as Record<string, string | undefined>;
    const where = patientId ? { patientId } : {};

    const exams = await prisma.exam.findMany({
      where,
      select: { status: true, date: true, value: true },
    });

    const byStatusMap = new Map<string, number>();
    const byMonthMap = new Map<string, number>();

    for (const exam of exams) {
      byStatusMap.set(exam.status, (byStatusMap.get(exam.status) ?? 0) + 1);
      const monthKey = `${exam.date.getFullYear()}-${String(exam.date.getMonth() + 1).padStart(2, '0')}`;
      byMonthMap.set(monthKey, (byMonthMap.get(monthKey) ?? 0) + 1);
    }

    const byStatus = Array.from(byStatusMap.entries()).map(([status, count]) => ({ status, count }));
    const byMonth = Array.from(byMonthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));

    return res.json({ total: exams.length, byStatus, byMonth });
  }),
);

router.get(
  '/',
  requirePermission('exams', 'view'),
  asyncHandler(async (req, res) => {
    const { patientId } = req.query as Record<string, string | undefined>;
    const exams = await prisma.exam.findMany({
      where: patientId ? { patientId } : undefined,
      orderBy: { date: 'desc' },
      include: {
        patient: { select: { id: true, name: true } },
        staff: { select: { id: true, name: true } },
      },
    });
    return res.json(exams);
  }),
);

router.get(
  '/:id',
  requirePermission('exams', 'view'),
  asyncHandler(async (req, res) => {
    const exam = await prisma.exam.findUnique({
      where: { id: req.params.id },
      include: { patient: { select: { id: true, name: true } }, staff: { select: { id: true, name: true } } },
    });
    if (!exam) return res.status(404).json({ error: 'Exame não encontrado' });
    return res.json(exam);
  }),
);

const createExamSchema = z.object({
  patientId: z.string().min(1),
  type: z.string().min(1),
  date: z.string().min(1),
  status: z.string().min(1),
  value: z.number().optional(),
  notes: z.string().optional(),
  attachmentUrl: z.string().url().optional(),
});

router.post(
  '/',
  requirePermission('exams', 'edit'),
  asyncHandler(async (req, res) => {
    const parsed = createExamSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }
    const data = parsed.data;
    const exam = await prisma.exam.create({
      data: {
        patientId: data.patientId,
        staffId: req.auth!.staffId!,
        type: data.type,
        date: new Date(data.date),
        status: data.status,
        value: data.value,
        notes: data.notes,
        attachmentUrl: data.attachmentUrl,
      },
    });
    return res.status(201).json(exam);
  }),
);

const updateExamSchema = createExamSchema.partial().omit({ patientId: true });

router.put(
  '/:id',
  requirePermission('exams', 'edit'),
  asyncHandler(async (req, res) => {
    const parsed = updateExamSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }
    const data = parsed.data;
    try {
      const exam = await prisma.exam.update({
        where: { id: req.params.id },
        data: {
          type: data.type,
          date: data.date ? new Date(data.date) : undefined,
          status: data.status,
          value: data.value,
          notes: data.notes,
          attachmentUrl: data.attachmentUrl,
        },
      });
      return res.json(exam);
    } catch (err) {
      if (isNotFoundError(err)) return res.status(404).json({ error: 'Exame não encontrado' });
      throw err;
    }
  }),
);

router.delete(
  '/:id',
  requirePermission('exams', 'edit'),
  asyncHandler(async (req, res) => {
    try {
      await prisma.exam.delete({ where: { id: req.params.id } });
      return res.json({ ok: true });
    } catch (err) {
      if (isNotFoundError(err)) return res.status(404).json({ error: 'Exame não encontrado' });
      throw err;
    }
  }),
);

export default router;
