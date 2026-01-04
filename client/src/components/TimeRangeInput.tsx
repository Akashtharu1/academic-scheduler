import React from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

export interface TimeRangeInputProps {
  startTime: string;
  endTime: string;
  onChange: (start: string, end: string) => void;
  onRemove: () => void;
  error?: string;
  showRemove: boolean;
}

export function TimeRangeInput({
  startTime,
  endTime,
  onChange,
  onRemove,
  error,
  showRemove,
}: TimeRangeInputProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <Input
            type="time"
            value={startTime}
            onChange={(e) => onChange(e.target.value, endTime)}
            placeholder="09:00"
            className={error ? "border-destructive" : ""}
            data-testid="input-start-time"
          />
        </div>
        <span className="text-muted-foreground">to</span>
        <div className="flex-1">
          <Input
            type="time"
            value={endTime}
            onChange={(e) => onChange(startTime, e.target.value)}
            placeholder="17:00"
            className={error ? "border-destructive" : ""}
            data-testid="input-end-time"
          />
        </div>
        {showRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="h-9 w-9 shrink-0"
            data-testid="button-remove-time-range"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {error && (
        <p className="text-sm text-destructive" data-testid="error-time-range">
          {error}
        </p>
      )}
    </div>
  );
}
