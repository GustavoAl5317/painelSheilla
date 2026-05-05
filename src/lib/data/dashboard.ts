import { prisma } from "@/lib/prisma";
import { addDays, startOfDay, startOfMonth, endOfMonth, subMonths } from "date-fns";

export async function getDashboardData(organizationId: string) {
  const now = new Date();
  const today = startOfDay(now);
  const in7days = addDays(now, 7);
  const thisMonthStart = startOfMonth(now);
  const thisMonthEnd = endOfMonth(now);
  const lastMonthStart = startOfMonth(subMonths(now, 1));
  const lastMonthEnd = endOfMonth(subMonths(now, 1));

  const [
    totalLeads,
    newLeads,
    awaitingData,
    converted,
    convertedThisMonth,
    convertedLastMonth,
    waitingResponse,
    totalClients,
    totalProcesses,
    activeProcesses,
    nearDeadlines,
    overdueDeadlines,
    todayDeadlines,
    tasksPending,
    tasksDueToday,
    leadsByStage,
    urgentDeadlines,
    recentLeads,
    recentClients,
    recentProcesses,
    unreadMessages,
    contactsAttendedToday,
    recentNotifications,
  ] = await Promise.all([
    prisma.lead.count({ where: { organizationId, status: "ACTIVE" } }),
    prisma.lead.count({ where: { organizationId, status: "ACTIVE", stage: { slug: "new_lead" } } }),
    prisma.lead.count({ where: { organizationId, status: "ACTIVE", stage: { slug: "awaiting_data" } } }),
    prisma.lead.count({ where: { organizationId, status: "CONVERTED" } }),
    prisma.lead.count({ where: { organizationId, status: "CONVERTED", convertedToClientAt: { gte: thisMonthStart, lte: thisMonthEnd } } }),
    prisma.lead.count({ where: { organizationId, status: "CONVERTED", convertedToClientAt: { gte: lastMonthStart, lte: lastMonthEnd } } }),
    prisma.conversation.count({ where: { organizationId, status: "WAITING_RESPONSE" } }),
    prisma.client.count({ where: { organizationId } }),
    prisma.process.count({ where: { organizationId } }),
    prisma.process.count({ where: { organizationId, status: "ACTIVE" } }),
    prisma.deadline.count({ where: { organizationId, status: "PENDING", dueDate: { gte: now, lte: in7days } } }),
    prisma.deadline.count({ where: { organizationId, status: { in: ["OVERDUE", "PENDING"] }, dueDate: { lt: now } } }),
    prisma.deadline.count({ where: { organizationId, status: "PENDING", dueDate: { gte: today, lte: addDays(today, 1) } } }),
    prisma.task.count({ where: { organizationId, status: { in: ["TODO", "IN_PROGRESS"] } } }),
    prisma.task.count({ where: { organizationId, status: { in: ["TODO", "IN_PROGRESS"] }, dueDate: { gte: today, lte: addDays(today, 1) } } }),
    prisma.kanbanStage.findMany({
      where: { organizationId },
      include: { _count: { select: { leads: { where: { status: "ACTIVE" } } } } },
      orderBy: { order: "asc" },
    }),
    prisma.deadline.findMany({
      where: {
        organizationId,
        OR: [
          { status: { in: ["OVERDUE", "PENDING"] }, dueDate: { lt: now } },
          { status: "PENDING", dueDate: { gte: now, lte: in7days } },
        ],
      },
      include: {
        process: { select: { id: true, number: true, title: true, client: { select: { name: true } } } },
      },
      orderBy: { dueDate: "asc" },
      take: 6,
    }),
    prisma.lead.findMany({
      where: { organizationId, status: "ACTIVE" },
      include: { stage: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.client.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { id: true, name: true, phone: true, createdAt: true },
    }),
    prisma.process.findMany({
      where: { organizationId, status: "ACTIVE" },
      orderBy: { lastMovementAt: "desc" },
      take: 4,
      select: { id: true, number: true, title: true, legalArea: true, lastMovement: true, lastMovementAt: true, client: { select: { name: true } } },
    }),
    prisma.conversation.count({ where: { organizationId, unreadCount: { gt: 0 } } }),
    prisma.conversation.count({ where: { organizationId, lastMessageAt: { gte: today } } }),
    prisma.notification.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: { id: true, type: true, title: true, message: true, read: true, createdAt: true },
    }),
  ]);

  const conversionRate = totalLeads + converted > 0
    ? Math.round((converted / (totalLeads + converted)) * 100)
    : 0;

  const conversionTrend = convertedLastMonth > 0
    ? Math.round(((convertedThisMonth - convertedLastMonth) / convertedLastMonth) * 100)
    : convertedThisMonth > 0 ? 100 : 0;

  return {
    newLeads,
    awaitingData,
    waitingResponse,
    nearDeadlines,
    overdueDeadlines,
    todayDeadlines,
    tasksPending,
    tasksDueToday,
    conversionRate,
    conversionTrend,
    totalLeads,
    converted,
    convertedThisMonth,
    totalClients,
    totalProcesses,
    activeProcesses,
    unreadMessages,
    contactsAttendedToday,
    leadsByStage: leadsByStage.map((s) => ({
      stage: s.name,
      count: s._count.leads,
      color: s.color,
      slug: s.slug,
    })),
    urgentDeadlines,
    recentLeads,
    recentClients,
    recentProcesses,
    recentNotifications,
  };
}
