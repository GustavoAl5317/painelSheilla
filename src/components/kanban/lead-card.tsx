"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Lead, User } from "@prisma/client";
import { MessageSquare, CheckSquare, Phone, Briefcase, Bot } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { getInitials, formatRelative, formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ConvertLeadButton } from "./convert-lead-button";

type LeadWithRelations = Lead & {
  assignedTo?: Pick<User, "id" | "name" | "avatar"> | null;
  _count?: { conversations: number; tasks: number };
};

interface LeadCardProps {
  lead: LeadWithRelations;
  isDragging?: boolean;
}

const sourceLabel: Record<string, string> = {
  WHATSAPP: "WhatsApp",
  WEBSITE: "Site",
  REFERRAL: "Indicação",
  SOCIAL_MEDIA: "Redes Sociais",
  EMAIL: "E-mail",
  PHONE: "Telefone",
  OTHER: "Outro",
};

export function LeadCard({ lead, isDragging = false }: LeadCardProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortableDragging } =
    useSortable({ id: lead.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "group rounded-xl bg-white border border-gray-200 p-3.5 shadow-sm cursor-grab active:cursor-grabbing select-none transition-shadow",
        (isDragging || isSortableDragging) && "opacity-50 shadow-lg ring-2 ring-blue-300"
      )}
    >
      {/* Nome + AI badge */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <span
          className="text-sm font-semibold text-gray-900 leading-tight line-clamp-1"
        >
          {lead.name}
        </span>
        {lead.aiQualified && (
          <div title="Qualificado por IA" className="shrink-0">
            <Bot className="h-3.5 w-3.5 text-blue-400" />
          </div>
        )}
      </div>

      {/* Área jurídica */}
      {lead.legalArea && (
        <div className="flex items-center gap-1.5 mb-2">
          <Briefcase className="h-3 w-3 text-gray-300 shrink-0" />
          <span className="text-xs text-gray-500 truncate">{lead.legalArea}</span>
        </div>
      )}

      {/* Contato */}
      {lead.phone && (
        <div className="flex items-center gap-1.5 mb-1">
          <Phone className="h-3 w-3 text-gray-300 shrink-0" />
          <span className="text-xs text-gray-400">{lead.phone}</span>
        </div>
      )}

      {/* Resumo do caso */}
      {lead.caseSummary && (
        <p className="text-xs text-gray-400 line-clamp-2 mt-2 mb-2.5 leading-relaxed">
          {lead.caseSummary}
        </p>
      )}

      {/* Score IA */}
      {lead.aiScore != null && (
        <div className="flex items-center gap-1.5 mb-2.5">
          <div className="flex-1 h-1 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full",
                lead.aiScore >= 70 ? "bg-green-400" : lead.aiScore >= 40 ? "bg-amber-400" : "bg-red-400"
              )}
              style={{ width: `${lead.aiScore}%` }}
            />
          </div>
          <span className="text-xs font-medium text-gray-400">{lead.aiScore}%</span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100">
        <div className="flex items-center gap-2.5">
          {lead._count?.conversations !== undefined && lead._count.conversations > 0 && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <MessageSquare className="h-3 w-3" />
              {lead._count.conversations}
            </span>
          )}
          {lead._count?.tasks !== undefined && lead._count.tasks > 0 && (
            <span className="flex items-center gap-1 text-xs text-gray-400">
              <CheckSquare className="h-3 w-3" />
              {lead._count.tasks}
            </span>
          )}
          <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
            {sourceLabel[lead.source] ?? lead.source}
          </Badge>
        </div>

        {lead.assignedTo && (
          <Avatar className="h-6 w-6">
            <AvatarFallback className="text-[9px]">{getInitials(lead.assignedTo.name)}</AvatarFallback>
          </Avatar>
        )}
      </div>

      <div className="flex items-center justify-between mt-2">
        <p className="text-[10px] text-gray-300">
          {mounted ? formatRelative(lead.createdAt) : formatDate(lead.createdAt)}
        </p>
        {!lead.clientId && (
          <ConvertLeadButton
            leadId={lead.id}
            leadName={lead.name}
            leadPhone={lead.phone}
            leadEmail={lead.email}
            organizationId={lead.organizationId}
          />
        )}
      </div>
    </div>
  );
}
