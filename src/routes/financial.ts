import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole, requirePermission } from '../middleware/auth';
import { decimalToNumber } from '../lib/serialize';
import { asyncHandler } from '../lib/asyncHandler';
import { isNotFoundError } from '../lib/prismaErrors';

const router = Router();

router.use(requireAuth, requireRole('ADMIN', 'EMPLOYEE'));

async function syncOverdueStatuses() {
  await prisma.financialEntry.updateMany({
    where: { status: 'PENDING', dueDate: { lt: new Date() } },
    data: { status: 'OVERDUE' },
  });
}

router.get(
  '/entries',
  requirePermission('financial', 'view'),
  asyncHandler(async (req, res) => {
    await syncOverdueStatuses();
    const { type, status, from, to } = req.query as Record<string, string | undefined>;

    const where: any = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (from || to) {
      where.dueDate = {};
      if (from) where.dueDate.gte = new Date(from);
      if (to) where.dueDate.lte = new Date(to);
    }

    const entries = await prisma.financialEntry.findMany({
      where,
      orderBy: { dueDate: 'asc' },
      include: { createdBy: { select: { name: true } } },
    });

    return res.json(entries.map((e) => decimalToNumber(e, ['amount'])));
  }),
);

router.get(
  '/summary',
  requirePermission('financial', 'view'),
  asyncHandler(async (_req, res) => {
    await syncOverdueStatuses();
    const entries = await prisma.financialEntry.findMany();

    let pendingTotal = 0;
    let paidTotal = 0;
    let overdueTotal = 0;
    let receivableTotal = 0;
    let payableTotal = 0;
    const byMonthMap = new Map<string, { receivable: number; payable: number }>();

    for (const e of entries) {
      const amount = Number(e.amount);
      if (e.status === 'PENDING') pendingTotal += amount;
      if (e.status === 'PAID') paidTotal += amount;
      if (e.status === 'OVERDUE') overdueTotal += amount;
      if (e.type === 'RECEIVABLE') receivableTotal += amount;
      if (e.type === 'PAYABLE') payableTotal += amount;

      const monthKey = `${e.dueDate.getFullYear()}-${String(e.dueDate.getMonth() + 1).padStart(2, '0')}`;
      const bucket = byMonthMap.get(monthKey) ?? { receivable: 0, payable: 0 };
      if (e.type === 'RECEIVABLE') bucket.receivable += amount;
      else bucket.payable += amount;
      byMonthMap.set(monthKey, bucket);
    }

    const byMonth = Array.from(byMonthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, v]) => ({ month, ...v }));

    return res.json({
      pendingTotal,
      paidTotal,
      overdueTotal,
      receivableTotal,
      payableTotal,
      balance: receivableTotal - payableTotal,
      byMonth,
    });
  }),
);

const createEntrySchema = z.object({
  type: z.enum(['PAYABLE', 'RECEIVABLE']),
  description: z.string().min(1),
  category: z.string().min(1),
  amount: z.number().positive(),
  dueDate: z.string().min(1),
  attachmentUrl: z.string().url().optional(),
});

router.post(
  '/entries',
  requirePermission('financial', 'edit'),
  asyncHandler(async (req, res) => {
    const parsed = createEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }
    const data = parsed.data;
    const entry = await prisma.financialEntry.create({
      data: {
        type: data.type,
        description: data.description,
        category: data.category,
        amount: data.amount,
        dueDate: new Date(data.dueDate),
        attachmentUrl: data.attachmentUrl,
        createdById: req.auth!.staffId!,
      },
    });
    return res.status(201).json(decimalToNumber(entry, ['amount']));
  }),
);

const updateEntrySchema = createEntrySchema.partial();

router.put(
  '/entries/:id',
  requirePermission('financial', 'edit'),
  asyncHandler(async (req, res) => {
    const parsed = updateEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }
    const data = parsed.data;
    try {
      const entry = await prisma.financialEntry.update({
        where: { id: req.params.id },
        data: {
          type: data.type,
          description: data.description,
          category: data.category,
          amount: data.amount,
          dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
          attachmentUrl: data.attachmentUrl,
        },
      });
      return res.json(decimalToNumber(entry, ['amount']));
    } catch (err) {
      if (isNotFoundError(err)) return res.status(404).json({ error: 'Lançamento não encontrado' });
      throw err;
    }
  }),
);

router.patch(
  '/entries/:id/pay',
  requirePermission('financial', 'edit'),
  asyncHandler(async (req, res) => {
    try {
      const entry = await prisma.financialEntry.update({
        where: { id: req.params.id },
        data: { status: 'PAID', paidDate: new Date() },
      });
      return res.json(decimalToNumber(entry, ['amount']));
    } catch (err) {
      if (isNotFoundError(err)) return res.status(404).json({ error: 'Lançamento não encontrado' });
      throw err;
    }
  }),
);

router.delete(
  '/entries/:id',
  requirePermission('financial', 'edit'),
  asyncHandler(async (req, res) => {
    try {
      await prisma.financialEntry.delete({ where: { id: req.params.id } });
      return res.json({ ok: true });
    } catch (err) {
      if (isNotFoundError(err)) return res.status(404).json({ error: 'Lançamento não encontrado' });
      throw err;
    }
  }),
);

export default router;
