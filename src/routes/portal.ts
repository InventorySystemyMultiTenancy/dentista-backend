import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireAuth, requirePatient } from '../middleware/auth';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

router.use(requireAuth, requirePatient);

router.get(
  '/appointments',
  asyncHandler(async (req, res) => {
    const appointments = await prisma.appointment.findMany({
      where: { patientId: req.auth!.patientId! },
      orderBy: { date: 'desc' },
      include: { staff: { select: { name: true } } },
    });
    return res.json(appointments);
  }),
);

router.get(
  '/exams',
  asyncHandler(async (req, res) => {
    const exams = await prisma.exam.findMany({
      where: { patientId: req.auth!.patientId! },
      orderBy: { date: 'desc' },
      include: { staff: { select: { name: true } } },
    });
    return res.json(exams);
  }),
);

export default router;
