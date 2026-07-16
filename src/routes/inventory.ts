import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole, requirePermission } from '../middleware/auth';
import { decimalToNumber } from '../lib/serialize';
import { asyncHandler } from '../lib/asyncHandler';
import { isNotFoundError } from '../lib/prismaErrors';

const router = Router();

router.use(requireAuth, requireRole('ADMIN', 'EMPLOYEE'));

router.get(
  '/items',
  requirePermission('inventory', 'view'),
  asyncHandler(async (_req, res) => {
    const items = await prisma.inventoryItem.findMany({ orderBy: { name: 'asc' } });
    return res.json(items.map((i) => decimalToNumber(i, ['costPrice'])));
  }),
);

router.get(
  '/low-stock',
  requirePermission('inventory', 'view'),
  asyncHandler(async (_req, res) => {
    const items = await prisma.inventoryItem.findMany({ orderBy: { name: 'asc' } });
    const low = items.filter((i) => i.quantity <= i.minQuantity);
    return res.json(low.map((i) => decimalToNumber(i, ['costPrice'])));
  }),
);

router.get(
  '/items/:id',
  requirePermission('inventory', 'view'),
  asyncHandler(async (req, res) => {
    const item = await prisma.inventoryItem.findUnique({
      where: { id: req.params.id },
      include: { movements: { orderBy: { createdAt: 'desc' }, include: { staff: { select: { name: true } } } } },
    });
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });
    return res.json(decimalToNumber(item, ['costPrice']));
  }),
);

const createItemSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  unit: z.string().min(1),
  quantity: z.number().min(0).default(0),
  minQuantity: z.number().min(0).default(0),
  costPrice: z.number().min(0).optional(),
  supplier: z.string().optional(),
});

router.post(
  '/items',
  requirePermission('inventory', 'edit'),
  asyncHandler(async (req, res) => {
    const parsed = createItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }
    const item = await prisma.inventoryItem.create({ data: parsed.data });
    return res.status(201).json(decimalToNumber(item, ['costPrice']));
  }),
);

const updateItemSchema = createItemSchema.partial();

router.put(
  '/items/:id',
  requirePermission('inventory', 'edit'),
  asyncHandler(async (req, res) => {
    const parsed = updateItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }
    try {
      const item = await prisma.inventoryItem.update({ where: { id: req.params.id }, data: parsed.data });
      return res.json(decimalToNumber(item, ['costPrice']));
    } catch (err) {
      if (isNotFoundError(err)) return res.status(404).json({ error: 'Item não encontrado' });
      throw err;
    }
  }),
);

router.delete(
  '/items/:id',
  requirePermission('inventory', 'edit'),
  asyncHandler(async (req, res) => {
    try {
      await prisma.inventoryItem.delete({ where: { id: req.params.id } });
      return res.json({ ok: true });
    } catch (err) {
      if (isNotFoundError(err)) return res.status(404).json({ error: 'Item não encontrado' });
      throw err;
    }
  }),
);

const createMovementSchema = z.object({
  itemId: z.string().min(1),
  type: z.enum(['IN', 'OUT', 'ADJUSTMENT']),
  quantity: z.number(),
  reason: z.string().optional(),
});

router.post(
  '/movements',
  requirePermission('inventory', 'edit'),
  asyncHandler(async (req, res) => {
    const parsed = createMovementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }
    const data = parsed.data;

    const item = await prisma.inventoryItem.findUnique({ where: { id: data.itemId } });
    if (!item) return res.status(404).json({ error: 'Item não encontrado' });

    let newQuantity = item.quantity;
    if (data.type === 'IN') newQuantity += data.quantity;
    else if (data.type === 'OUT') newQuantity -= data.quantity;
    else newQuantity = data.quantity;

    if (newQuantity < 0) {
      return res.status(400).json({ error: 'Quantidade insuficiente em estoque' });
    }

    const [movement] = await prisma.$transaction([
      prisma.inventoryMovement.create({
        data: {
          itemId: data.itemId,
          type: data.type,
          quantity: data.quantity,
          reason: data.reason,
          staffId: req.auth!.staffId!,
        },
      }),
      prisma.inventoryItem.update({ where: { id: data.itemId }, data: { quantity: newQuantity } }),
    ]);

    return res.status(201).json(movement);
  }),
);

export default router;
