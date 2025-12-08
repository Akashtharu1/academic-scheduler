import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Filter,
  Download,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Timetable, ScheduledSlot, Course, Faculty, Room } from "@shared/schema";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const TIME_SLOTS = [
  "08:00", "09:00", "10:00", "11:00", "12:00",
  "13:00", "14:00", "15:00", "16:00", "17:00"
];

interface TimetableData {
  timetables: Timetable[];
  slots: (ScheduledSlot & {
    course?: Course;
    faculty?: Faculty;
    room?: Room;
  })[];
}

const statusColors = {
  ok: "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  conflict: "bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-300",
  warning: "bg-yellow-500/10 border-yellow-500/20 text-yellow-700 dark:text-yellow-300",
};

export default function TimetablePage() {
  const [selectedDepartment, setSelectedDepartment] = useState<string>("all");
  const [selectedSemester, setSelectedSemester] = useState<string>("all");

  const { data, isLoading } = useQuery<TimetableData>({
    queryKey: ["/api/timetables/view"],
  });

  const departments = [...new Set(data?.timetables?.map(t => t.department) || [])];
  const semesters = [...new Set(data?.timetables?.map(t => t.semester) || [])].sort();

  const filteredSlots = data?.slots?.filter(slot => {
    const timetable = data.timetables?.find(t => t.id === slot.timetableId);
    if (!timetable) return false;
    if (selectedDepartment !== "all" && timetable.department !== selectedDepartment) return false;
    if (selectedSemester !== "all" && timetable.semester !== parseInt(selectedSemester)) return false;
    return true;
  }) || [];

  const getSlotForDayTime = (day: string, time: string) => {
    return filteredSlots.find(
      slot => slot.day === day && slot.startTime === time
    );
  };

  const activeTimetable = data?.timetables?.find(t => t.status === "active");

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-timetable-title">
            Timetable View
          </h1>
          <p className="text-muted-foreground">
            View and manage your class schedules
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" data-testid="button-export-timetable">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters</span>
            </div>
            <div className="flex items-center gap-2">
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger className="w-[150px]" data-testid="select-department">
                  <SelectValue placeholder="Department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departments.map(dept => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedSemester} onValueChange={setSelectedSemester}>
                <SelectTrigger className="w-[130px]" data-testid="select-semester">
                  <SelectValue placeholder="Semester" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Semesters</SelectItem>
                  {semesters.map(sem => (
                    <SelectItem key={sem} value={sem.toString()}>Semester {sem}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
      </Card>

      {activeTimetable && (
        <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/50 border">
          <Calendar className="h-5 w-5 text-primary" />
          <div className="flex-1">
            <p className="text-sm font-medium">
              Active: {activeTimetable.department} - Semester {activeTimetable.semester}
            </p>
            <p className="text-xs text-muted-foreground">
              Version {activeTimetable.versionId}
            </p>
          </div>
          {(activeTimetable.conflictCount || 0) > 0 && (
            <Badge variant="destructive" className="text-xs">
              <AlertTriangle className="h-3 w-3 mr-1" />
              {activeTimetable.conflictCount} conflicts
            </Badge>
          )}
        </div>
      )}

      <Card>
        <CardContent className="pt-6 overflow-x-auto">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filteredSlots.length > 0 ? (
            <div className="min-w-[800px]">
              <div className="grid grid-cols-7 gap-2">
                <div className="p-2 text-center text-sm font-medium text-muted-foreground">
                  Time
                </div>
                {DAYS.map(day => (
                  <div key={day} className="p-2 text-center text-sm font-medium">
                    {day}
                  </div>
                ))}
              </div>
              {TIME_SLOTS.map(time => (
                <div key={time} className="grid grid-cols-7 gap-2 mt-2">
                  <div className="p-2 text-center text-xs text-muted-foreground flex items-center justify-center">
                    {time}
                  </div>
                  {DAYS.map(day => {
                    const slot = getSlotForDayTime(day, time);
                    if (slot) {
                      const statusClass = statusColors[slot.status as keyof typeof statusColors] || statusColors.ok;
                      return (
                        <Tooltip key={`${day}-${time}`}>
                          <TooltipTrigger asChild>
                            <div
                              className={`p-2 rounded-md border cursor-pointer transition-all hover:scale-[1.02] ${statusClass}`}
                              data-testid={`slot-${day}-${time}`}
                            >
                              <p className="text-xs font-medium truncate">
                                {slot.course?.code || "Course"}
                              </p>
                              <p className="text-[10px] opacity-75 truncate">
                                {slot.room?.code || "Room"}
                              </p>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="space-y-1">
                              <p className="font-medium">{slot.course?.name || "Unknown Course"}</p>
                              <p className="text-xs">Room: {slot.room?.name || "Unknown"}</p>
                              <p className="text-xs">Faculty: {slot.faculty?.name || "Unknown"}</p>
                              <p className="text-xs">{slot.startTime} - {slot.endTime}</p>
                              {slot.status !== "ok" && (
                                <Badge variant={slot.status === "conflict" ? "destructive" : "secondary"} className="text-xs">
                                  {slot.status}
                                </Badge>
                              )}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      );
                    }
                    return (
                      <div
                        key={`${day}-${time}`}
                        className="p-2 rounded-md border border-dashed border-muted-foreground/20 min-h-[50px]"
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12">
              <Calendar className="h-12 w-12 text-muted-foreground/50 mb-4" />
              <CardTitle className="text-lg mb-1">No timetable data</CardTitle>
              <CardDescription>
                Generate a timetable to view the schedule here
              </CardDescription>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-center gap-4">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-emerald-500/20 border border-emerald-500/30" />
          <span className="text-xs text-muted-foreground">No conflicts</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-yellow-500/20 border border-yellow-500/30" />
          <span className="text-xs text-muted-foreground">Warning</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-red-500/20 border border-red-500/30" />
          <span className="text-xs text-muted-foreground">Conflict</span>
        </div>
      </div>
    </div>
  );
}
