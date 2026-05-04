import Link from "next/link";
import { KanbanSquare, MessageSquare } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";

interface ProcessCrmCardsProps {
  processId: string;
}

export async function ProcessCrmCards({ processId }: ProcessCrmCardsProps) {
  const cards = await prisma.crmCard.findMany({
    where: { processId },
    orderBy: { createdAt: "desc" },
    include: {
      board: { select: { id: true, name: true, color: true } },
      _count: { select: { activities: true } },
    },
  });

  if (cards.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <KanbanSquare className="h-4 w-4 text-blue-500" />
          <CardTitle className="text-base">Cards CRM ({cards.length})</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {cards.map((card) => (
          <Link key={card.id} href="/crm">
            <div className="flex items-start justify-between py-2.5 px-3 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50/30 transition-colors cursor-pointer">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{card.title}</p>
                {card.description && (
                  <p className="text-xs text-gray-400 truncate mt-0.5">{card.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                {card._count.activities > 0 && (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <MessageSquare className="h-3 w-3" />
                    {card._count.activities}
                  </span>
                )}
                <Badge
                  variant="secondary"
                  className="text-[10px] px-1.5 py-0"
                  style={{ backgroundColor: `${card.board.color}20`, color: card.board.color }}
                >
                  {card.board.name}
                </Badge>
              </div>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
