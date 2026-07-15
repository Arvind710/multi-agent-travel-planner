import { DateTime } from "luxon";

/**
 * Structural view of the fields exports need. @raah/plan-graph depends on this
 * package, so importing PlanGraph here would create a workspace cycle.
 */
export interface ExportableBlock {
  node_id: string;
  title: string;
  narrative?: string;
  time_start?: string;
  time_end?: string;
  reasoning?: { summary?: string };
  venue?: { name?: string };
}

export interface ExportableGraph {
  concept: { title: string; narrative: string };
  days: Array<{ date: string; blocks: ExportableBlock[] }>;
  budget: { total: { amount: number } };
}

/**
 * P6.7: Generates an ICS calendar file for the given PlanGraph.
 */
export function generateIcs(graph: ExportableGraph): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Raah//AI Travel Planner//EN",
    "CALSCALE:GREGORIAN",
  ];

  const now = DateTime.utc().toFormat("yyyyMMdd'T'HHmmss'Z'");

  for (const day of graph.days) {
    const dayDateStr = day.date.replace(/-/g, ""); // e.g. 20261207

    for (const block of day.blocks) {
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:block-${block.node_id}@raah.app`);
      lines.push(`DTSTAMP:${now}`);
      // Naive time handling for ICS. In reality, we'd use block.time_start and block.time_end
      // mapped to the day's date, but block time is a string like "09:00" or undefined.
      // Defaulting to all-day events if time missing.
      if (block.time_start) {
        const tStart = block.time_start.replace(":", "") + "00";
        lines.push(`DTSTART;TZID=Asia/Kolkata:${dayDateStr}T${tStart}`);
        const tEnd = block.time_end
          ? block.time_end.replace(":", "") + "00"
          : String(parseInt(tStart) + 20000).padStart(6, "0");
        lines.push(`DTEND;TZID=Asia/Kolkata:${dayDateStr}T${tEnd}`);
      } else {
        lines.push(`DTSTART;VALUE=DATE:${dayDateStr}`);
        lines.push(`DTEND;VALUE=DATE:${dayDateStr}`);
      }

      lines.push(`SUMMARY:${block.title}`);
      lines.push(`DESCRIPTION:${block.narrative}\\n\\n${block.reasoning?.summary || ""}`);
      if (block.venue?.name) {
        lines.push(`LOCATION:${block.venue.name}`);
      }
      lines.push("END:VEVENT");
    }
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

/**
 * Generates a WhatsApp-friendly text summary of the trip.
 */
export function generateTextSummary(graph: ExportableGraph): string {
  let summary = `✈️ *${graph.concept.title}*\n\n`;
  summary += `_${graph.concept.narrative}_\n\n`;

  for (const day of graph.days) {
    summary += `📅 *${day.date}*\n`;
    for (const block of day.blocks) {
      summary += `- ${block.time_start ? `${block.time_start}: ` : ""}${block.title}\n`;
    }
    summary += "\n";
  }

  summary += `💰 *Est. Budget:* ₹${graph.budget.total.amount}\n`;
  summary += `\nView full details on Raah: https://raah.app/trip/view`;

  return summary;
}
