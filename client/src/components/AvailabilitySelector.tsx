import React, { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { TimeRangeInput } from "./TimeRangeInput";
import type { AvailabilityData, DayOfWeek, TimeRange } from "@shared/availability";
import { isValidTimeRange, hasOverlappingRanges } from "@shared/availability";

export interface AvailabilitySelectorProps {
  value: AvailabilityData;
  onChange: (value: AvailabilityData) => void;
  error?: string;
}

const DAYS: DayOfWeek[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const DAY_LABELS: Record<DayOfWeek, string> = {
  Mon: "Monday",
  Tue: "Tuesday",
  Wed: "Wednesday",
  Thu: "Thursday",
  Fri: "Friday",
  Sat: "Saturday",
};

export function AvailabilitySelector({
  value,
  onChange,
  error,
}: AvailabilitySelectorProps) {
  const [dayErrors, setDayErrors] = useState<Record<string, string>>({});

  const isDaySelected = (day: DayOfWeek): boolean => {
    return value.schedule.some((d) => d.day === day);
  };

  const getDayTimeRanges = (day: DayOfWeek): TimeRange[] => {
    const dayAvail = value.schedule.find((d) => d.day === day);
    return dayAvail?.timeRanges || [];
  };

  const handleDayToggle = (day: DayOfWeek, checked: boolean) => {
    if (checked) {
      // Add day with one empty time range
      const newSchedule = [
        ...value.schedule,
        {
          day,
          timeRanges: [{ startTime: "09:00", endTime: "17:00" }],
        },
      ];
      onChange({ schedule: newSchedule });
    } else {
      // Remove day
      const newSchedule = value.schedule.filter((d) => d.day !== day);
      onChange({ schedule: newSchedule });
      
      // Clear error for this day
      const newErrors = { ...dayErrors };
      delete newErrors[day];
      setDayErrors(newErrors);
    }
  };

  const handleTimeRangeChange = (
    day: DayOfWeek,
    index: number,
    startTime: string,
    endTime: string
  ) => {
    const newSchedule = value.schedule.map((d) => {
      if (d.day === day) {
        const newTimeRanges = [...d.timeRanges];
        newTimeRanges[index] = { startTime, endTime };
        return { ...d, timeRanges: newTimeRanges };
      }
      return d;
    });
    onChange({ schedule: newSchedule });

    // Validate the time range
    const newRange = { startTime, endTime };
    const newErrors = { ...dayErrors };
    
    if (!isValidTimeRange(newRange)) {
      newErrors[`${day}-${index}`] = "End time must be after start time";
    } else {
      delete newErrors[`${day}-${index}`];
      
      // Check for overlaps
      const dayRanges = newSchedule.find((d) => d.day === day)?.timeRanges || [];
      if (hasOverlappingRanges(dayRanges)) {
        newErrors[day] = "Time ranges cannot overlap";
      } else {
        delete newErrors[day];
      }
    }
    
    setDayErrors(newErrors);
  };

  const handleAddTimeRange = (day: DayOfWeek) => {
    const newSchedule = value.schedule.map((d) => {
      if (d.day === day) {
        return {
          ...d,
          timeRanges: [
            ...d.timeRanges,
            { startTime: "09:00", endTime: "17:00" },
          ],
        };
      }
      return d;
    });
    onChange({ schedule: newSchedule });
  };

  const handleRemoveTimeRange = (day: DayOfWeek, index: number) => {
    const newSchedule = value.schedule.map((d) => {
      if (d.day === day) {
        const newTimeRanges = d.timeRanges.filter((_, i) => i !== index);
        return { ...d, timeRanges: newTimeRanges };
      }
      return d;
    });
    onChange({ schedule: newSchedule });
    
    // Clear errors for this range
    const newErrors = { ...dayErrors };
    delete newErrors[`${day}-${index}`];
    setDayErrors(newErrors);
  };

  const handleSelectAllDays = () => {
    // Check if all days are already selected
    const allSelected = DAYS.every((day) => isDaySelected(day));
    
    if (allSelected) {
      // Deselect all days
      onChange({ schedule: [] });
      setDayErrors({});
    } else {
      // Select all days with default time range
      const newSchedule = DAYS.map((day) => {
        const existing = value.schedule.find((d) => d.day === day);
        return existing || {
          day,
          timeRanges: [{ startTime: "09:00", endTime: "17:00" }],
        };
      });
      onChange({ schedule: newSchedule });
    }
  };

  const allDaysSelected = DAYS.every((day) => isDaySelected(day));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSelectAllDays}
          data-testid="button-select-all-days"
        >
          {allDaysSelected ? "Deselect All" : "Select All Days"}
        </Button>
      </div>
      <div className="space-y-3">
        {DAYS.map((day) => {
          const selected = isDaySelected(day);
          const timeRanges = getDayTimeRanges(day);

          return (
            <div
              key={day}
              className="border rounded-lg p-4 space-y-3"
              data-testid={`day-container-${day}`}
            >
              <div className="flex items-center space-x-2">
                <Checkbox
                  id={`day-${day}`}
                  checked={selected}
                  onCheckedChange={(checked) =>
                    handleDayToggle(day, checked as boolean)
                  }
                  data-testid={`checkbox-${day}`}
                />
                <label
                  htmlFor={`day-${day}`}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  {DAY_LABELS[day]}
                </label>
              </div>

              {selected && (
                <div className="ml-6 space-y-3">
                  {timeRanges.map((range, index) => (
                    <TimeRangeInput
                      key={index}
                      startTime={range.startTime}
                      endTime={range.endTime}
                      onChange={(start, end) =>
                        handleTimeRangeChange(day, index, start, end)
                      }
                      onRemove={() => handleRemoveTimeRange(day, index)}
                      showRemove={timeRanges.length > 1}
                      error={dayErrors[`${day}-${index}`]}
                    />
                  ))}
                  
                  {dayErrors[day] && (
                    <p className="text-sm text-destructive" data-testid={`error-${day}`}>
                      {dayErrors[day]}
                    </p>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleAddTimeRange(day)}
                    className="w-full"
                    data-testid={`button-add-range-${day}`}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Time Range
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <p className="text-sm text-destructive" data-testid="error-availability">
          {error}
        </p>
      )}
    </div>
  );
}
