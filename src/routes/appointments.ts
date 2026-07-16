import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requireAuth, requireRole, requirePermission } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';
import { isNotFoundError } from '../lib/prismaErrors';

const router = Router();

router.use(requireAuth, requireRole('ADMIN', 'EMPLOYEE'));

// Horário de funcionamento padrão da clínica (pode virar configuração no futuro).
const WORK_START_MINUTES = 8 * 60;
const WORK_END_MINUTES = 18 * 60;
const SLOT_DURATION_MINUTES = 30;

function minutesToTime(minutes: number) {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, '0');
  const m = (minutes % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

router.get(
  '/',
  requirePermission('agenda', 'view'),
  asyncHandler(async (req, res) => {
    const { date, from, to, staffId, patientId } = req.query as Record<string, string | undefined>;

    const where: any = {};
    if (staffId) where.staffId = staffId;
    if (patientId) where.patientId = patientId;
    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
      where.date = { gte: start, lt: end };
    } else if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) where.date.lte = new Date(to);
    }

    const appointments = await prisma.appointment.findMany({
      where,
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      include: {
        patient: { select: { id: true, name: true, phone: true } },
        staff: { select: { id: true, name: true } },
      },
    });

    return res.json(appointments);
  }),
);

router.get(
  '/available-slots',
  requirePermission('agenda', 'view'),
  asyncHandler(async (req, res) => {
    const { date, staffId } = req.query as Record<string, string | undefined>;
    if (!date || !staffId) {
      return res.status(400).json({ error: 'Informe date e staffId' });
    }

    const start = new Date(date);
    const end = new Date(date);
    end.setDate(end.getDate() + 1);

    const taken = await prisma.appointment.findMany({
      where: { staffId, date: { gte: start, lt: end }, status: 'SCHEDULED' },
      select: { startTime: true },
    });
    const takenSet = new Set(taken.map((t) => t.startTime));

    const slots: string[] = [];
    for (let m = WORK_START_MINUTES; m < WORK_END_MINUTES; m += SLOT_DURATION_MINUTES) {
      const time = minutesToTime(m);
      if (!takenSet.has(time)) slots.push(time);
    }

    return res.json({ slots });
  }),
);

const createAppointmentSchema = z.object({
  patientId: z.string().min(1),
  staffId: z.string().min(1),
  date: z.string().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().optional(),
});

router.post(
  '/',
  requirePermission('agenda', 'edit'),
  asyncHandler(async (req, res) => {
    const parsed = createAppointmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Dados inválidos' });
    }
    const data = parsed.data;

    const [h, m] = data.startTime.split(':').map(Number);
    const endMinutes = h * 60 + m + SLOT_DURATION_MINUTES;
    const endTime = minutesToTime(endMinutes);
    const date = new Date(data.date);

    const conflict = await prisma.appointment.findFirst({
      where: {
        staffId: data.staffId,
        date,
        startTime: data.startTime,
        status: 'SCHEDULED',
      },
    });
    if (conflict) {
      return res.status(409).json({ error: 'Horário já ocupado para este profissional' });
    }

    const appointment = await prisma.appointment.create({
      data: {
        patientId: data.patientId,
        staffId: data.staffId,
        date,
        startTime: data.startTime,
        endTime,
        notes: data.notes,
      },
      include: {
        patient: { select: { id: true, name: true, phone: true } },
        staff: { select: { id: true, name: true } },
      },
    });

    return res.status(201).json(appointment);
  }),
);

function statusUpdateRoute(path: string, status: 'CANCELLED' | 'COMPLETED' | 'NO_SHOW') {
  router.patch(
    path,
    requirePermission('agenda', 'edit'),
    asyncHandler(async (req, res) => {
      try {
        const appointment = await prisma.appointment.update({
          where: { id: req.params.id },
          data: { status },
        });
        return res.json(appointment);
      } catch (err) {
        if (isNotFoundError(err)) return res.status(404).json({ error: 'Agendamento não encontrado' });
        throw err;
      }
    }),
  );
}

statusUpdateRoute('/:id/cancel', 'CANCELLED');
statusUpdateRoute('/:id/complete', 'COMPLETED');
statusUpdateRoute('/:id/no-show', 'NO_SHOW');

router.delete(
  '/:id',
  requirePermission('agenda', 'edit'),
  asyncHandler(async (req, res) => {
    try {
      await prisma.appointment.delete({ where: { id: req.params.id } });
      return res.json({ ok: true });
    } catch (err) {
      if (isNotFoundError(err)) return res.status(404).json({ error: 'Agendamento não encontrado' });
      throw err;
    }
  }),
);

export default router;
