"use client";

import React from "react";
import { Day, Block, MealSlot } from "@raah/plan-graph";

export function TimelineBlock({ block }: { block: Block }) {
  return (
    <div className="flex gap-4 mb-6 relative">
      <div className="w-16 flex-shrink-0 text-sm text-muted-foreground text-right pt-1">
        {block.duration_minutes}m
      </div>
      <div className="w-px bg-border relative">
        <div className="absolute top-2 -left-1 w-2.5 h-2.5 rounded-full bg-primary" />
      </div>
      <div className="flex-1 bg-card border border-border p-4 rounded-xl shadow-sm">
        <h4 className="font-semibold">{block.title}</h4>
        {block.tags?.length > 0 && (
          <div className="flex gap-2 mt-2">
            {block.tags.map((t) => (
              <span key={t} className="text-xs bg-muted px-2 py-0.5 rounded">
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function MealBlock({ meal }: { meal: MealSlot }) {
  return (
    <div className="flex gap-4 mb-6 relative opacity-80">
      <div className="w-16 flex-shrink-0 text-sm text-muted-foreground text-right pt-1">
        {meal.slot}
      </div>
      <div className="w-px bg-border relative">
        <div className="absolute top-2 -left-1 w-2.5 h-2.5 rounded-full bg-secondary" />
      </div>
      <div className="flex-1 p-3 border border-border border-dashed rounded-xl">
        <p className="font-medium text-sm">🍽 {meal.venue}</p>
      </div>
    </div>
  );
}

export function DayCard({ day, index }: { day: Day; index: number }) {
  return (
    <div id={`day-${index}`} className="mb-12 max-w-4xl mx-auto px-4">
      <div className="sticky top-0 bg-background/90 backdrop-blur z-10 py-4 mb-6 border-b border-border">
        <h2 className="text-2xl font-bold">
          Day {index + 1}: {day.date}
        </h2>
        <p className="text-sm text-muted-foreground">Energy Level: {day.energy_rating}</p>
      </div>

      <div className="pl-2">
        {day.blocks?.map((block) => (
          <TimelineBlock key={block.node_id} block={block} />
        ))}
        {day.meals?.map((meal) => (
          <MealBlock key={meal.node_id} meal={meal} />
        ))}
      </div>
    </div>
  );
}

export function DaysList({ days }: { days: Day[] }) {
  if (!days?.length) return null;
  return (
    <section id="days" className="mt-12">
      {days.map((day, idx) => (
        <DayCard key={day.node_id} day={day} index={idx} />
      ))}
    </section>
  );
}
