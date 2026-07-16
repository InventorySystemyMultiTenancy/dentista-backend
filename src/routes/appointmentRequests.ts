import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { isNotFoundError } from '../lib/prismaErrors';

const router = Router();

router.use(requireAuth, requireRole('ADMIN', 'EMPLOYEE'));

router.get(
  '/',
  requirePermission('agenda', 'view'),
  asyncHandler(async (req, res) => {
    const { status } = req.query as Record<string, string | undefined>;
    const requests = await prisma.appointmentRequest.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: { createdAt: 'desc' },
      include: { patient: { select: { id: true, name: true, phone: true } } },
    });
    return res.json(requests);
  }),
);

const updateStatusSchema = z.object({
  status: z.enum(['PENDING', 'CONTACTED', 'DONE']),
});

router.patch(
  '/:id/status',
  requirePermission('agenda', 'edit'),
  asyncHandler(async (req, res) => {
    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }
    try {
      const request = await prisma.appointmentRequest.update({
        where: { id: req.params.id },
        data: { status: parsed.data.status },
      });
      return res.json(request);
    } catch (err) {
      if (isNotFoundError(err)) return res.status(404).json({ error: 'Solicitação não encontrada' });
      throw err;
    }
  }),
);

export default router;
