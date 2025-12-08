import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  TrendingUp,
  Building,
  Users,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { Analytics, Faculty, Room, Timetable } from "@shared/schema";

interface AnalyticsData {
  analytics: Analytics;
  faculty: Faculty[];
  rooms: Room[];
  timetables: Timetable[];
}

export default function AnalyticsPage() {
  const { data, isLoading } = useQuery<AnalyticsData>({
    queryKey: ["/api/analytics"],
  });

  const roomUtilization = data?.analytics?.roomUtilization || [];
  const teacherLoad = data?.analytics?.teacherLoad || [];
  const conflictStats = data?.analytics?.conflictStats || { total: 0, byType: {}, trend: [] };

  const avgRoomUtil = roomUtilization.length
    ? Math.round(roomUtilization.reduce((acc, r) => acc + r.utilization, 0) / roomUtilization.length)
    : 0;

  const avgTeacherLoad = teacherLoad.length
    ? Math.round(teacherLoad.reduce((acc, t) => acc + t.percentage, 0) / teacherLoad.length)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-analytics-title">
          Analytics Dashboard
        </h1>
        <p className="text-muted-foreground">
          Insights and statistics about your scheduling system
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Room Utilization
            </CardTitle>
            <Building className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="stat-avg-room-util">
                {avgRoomUtil}%
              </div>
            )}
            <Progress value={avgRoomUtil} className="mt-2 h-1" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Avg Teacher Load
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="stat-avg-teacher-load">
                {avgTeacherLoad}%
              </div>
            )}
            <Progress value={avgTeacherLoad} className="mt-2 h-1" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Conflicts
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold" data-testid="stat-total-conflicts">
                {conflictStats.total}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Across all timetables
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Schedules
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">
                {data?.timetables?.filter(t => t.status === 'active').length || 0}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Currently in use
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              Room Utilization
            </CardTitle>
            <CardDescription>Usage statistics by room</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map(i => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : roomUtilization.length > 0 ? (
              <div className="space-y-4">
                {roomUtilization.map((room) => (
                  <div key={room.roomId} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{room.roomName}</span>
                        <Badge variant="outline" className="text-xs">
                          {room.usedHours}/{room.totalHours}h
                        </Badge>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {room.utilization}%
                      </span>
                    </div>
                    <Progress value={room.utilization} className="h-2" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Building className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">No room data available</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Faculty Workload
            </CardTitle>
            <CardDescription>Teaching hours distribution</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map(i => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : teacherLoad.length > 0 ? (
              <div className="space-y-4">
                {teacherLoad.map((teacher) => (
                  <div key={teacher.facultyId} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{teacher.facultyName}</span>
                        <Badge variant="outline" className="text-xs">
                          {teacher.hours}/{teacher.maxHours}h
                        </Badge>
                      </div>
                      <span className={`text-sm ${
                        teacher.percentage > 90 
                          ? "text-red-500" 
                          : teacher.percentage > 75 
                          ? "text-yellow-500" 
                          : "text-muted-foreground"
                      }`}>
                        {teacher.percentage}%
                      </span>
                    </div>
                    <Progress 
                      value={teacher.percentage} 
                      className={`h-2 ${
                        teacher.percentage > 90 
                          ? "[&>div]:bg-red-500" 
                          : teacher.percentage > 75 
                          ? "[&>div]:bg-yellow-500" 
                          : ""
                      }`}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Users className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">No faculty data available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Conflict Analysis
          </CardTitle>
          <CardDescription>Breakdown of scheduling conflicts</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-4">
              {[1, 2, 3, 4].map(i => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          ) : Object.keys(conflictStats.byType).length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-4">
              {Object.entries(conflictStats.byType).map(([type, count]) => (
                <div key={type} className="p-4 rounded-lg bg-muted/50 text-center">
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="text-xs text-muted-foreground capitalize">{type} Conflicts</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <TrendingUp className="h-10 w-10 text-emerald-500/50 mb-3" />
              <p className="text-sm font-medium text-emerald-600">No conflicts detected</p>
              <p className="text-xs text-muted-foreground">Your schedules are optimized</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
