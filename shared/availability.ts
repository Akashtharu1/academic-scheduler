import { z } from "zod";
import type { DayOfWeek } from "./schema";

// Re-export DayOfWeek for convenience
export type { DayOfWeek } from "./schema";

/**
 * Time range representing a continuous period with start and end times
 */
export interface TimeRange {
  startTime: string; // Format: "HH:MM" (24-hour)
  endTime: string;   // Format: "HH:MM" (24-hour)
}

/**
 * Availability for a specific day with one or more time ranges
 */
export interface DayAvailability {
  day: DayOfWeek;
  timeRanges: TimeRange[];
}

/**
 * Complete availability data structure for a faculty member
 */
export interface AvailabilityData {
  schedule: DayAvailability[];
}

/**
 * Regular expression for validating time format (HH:MM in 24-hour format)
 * Matches: 00:00 to 23:59
 */
export const TIME_FORMAT_REGEX = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;

/**
 * Regular expression for 12-hour time format with AM/PM
 * Matches: 1:00 AM, 12:30 PM, etc.
 */
export const TIME_12H_FORMAT_REGEX = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM|am|pm)$/;

/**
 * Validates if a string is in valid 24-hour time format (HH:MM)
 */
export function isValidTimeFormat(time: string): boolean {
  return TIME_FORMAT_REGEX.test(time);
}

/**
 * Parses a time string in either 24-hour or 12-hour format
 * Returns normalized 24-hour format (HH:MM) or null if invalid
 */
export function parseTime(time: string): string | null {
  // Try 24-hour format first
  if (TIME_FORMAT_REGEX.test(time)) {
    return time;
  }

  // Try 12-hour format
  const match12h = time.match(TIME_12H_FORMAT_REGEX);
  if (match12h) {
    let [hours, minutes] = time.split(':');
    const isPM = time.toUpperCase().includes('PM');
    const isAM = time.toUpperCase().includes('AM');
    
    // Remove AM/PM from minutes
    minutes = minutes.replace(/\s?(AM|PM|am|pm)/g, '');
    
    let hour = parseInt(hours, 10);
    
    // Convert to 24-hour format
    if (isPM && hour !== 12) {
      hour += 12;
    } else if (isAM && hour === 12) {
      hour = 0;
    }
    
    return `${hour.toString().padStart(2, '0')}:${minutes}`;
  }

  return null;
}

/**
 * Compares two time strings and returns true if time1 is after time2
 * Both times should be in HH:MM format
 */
export function isTimeAfter(time1: string, time2: string): boolean {
  const [h1, m1] = time1.split(':').map(Number);
  const [h2, m2] = time2.split(':').map(Number);
  
  if (h1 > h2) return true;
  if (h1 < h2) return false;
  return m1 > m2;
}

/**
 * Checks if two time ranges overlap
 */
export function doTimeRangesOverlap(range1: TimeRange, range2: TimeRange): boolean {
  // Range1 starts during range2
  if (
    (range1.startTime >= range2.startTime && range1.startTime < range2.endTime) ||
    // Range1 ends during range2
    (range1.endTime > range2.startTime && range1.endTime <= range2.endTime) ||
    // Range1 completely contains range2
    (range1.startTime <= range2.startTime && range1.endTime >= range2.endTime)
  ) {
    return true;
  }
  
  return false;
}

/**
 * Checks if any time ranges in an array overlap with each other
 * Returns true if overlaps are found
 */
export function hasOverlappingRanges(ranges: TimeRange[]): boolean {
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      if (doTimeRangesOverlap(ranges[i], ranges[j])) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Validates that end time is after start time for a time range
 */
export function isValidTimeRange(range: TimeRange): boolean {
  return isTimeAfter(range.endTime, range.startTime);
}

/**
 * Zod schema for time range validation
 */
export const timeRangeSchema = z.object({
  startTime: z.string().regex(TIME_FORMAT_REGEX, "Invalid time format (use HH:MM)"),
  endTime: z.string().regex(TIME_FORMAT_REGEX, "Invalid time format (use HH:MM)"),
}).refine(
  (data) => isValidTimeRange(data),
  { message: "End time must be after start time" }
);

/**
 * Zod schema for day availability validation
 */
export const dayAvailabilitySchema = z.object({
  day: z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]),
  timeRanges: z.array(timeRangeSchema).min(1, "At least one time range required"),
}).refine(
  (data) => !hasOverlappingRanges(data.timeRanges),
  { message: "Time ranges cannot overlap" }
);

/**
 * Zod schema for complete availability data validation
 */
export const availabilityDataSchema = z.object({
  schedule: z.array(dayAvailabilitySchema),
}).refine(
  (data) => data.schedule.length > 0,
  { message: "At least one day must be selected" }
);
