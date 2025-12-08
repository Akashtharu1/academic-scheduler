import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  Users,
  BookOpen,
  Building,
  AlertTriangle,
  TrendingUp,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import type { Faculty, Course, Room, Timetable } from "@shared/schema";

interface StatsData {
  faculty: Faculty[];
  courses: Course[];
  rooms: Room[];
  timetables: Timetable[];
}

export default function Dashboard() {
  const { user } = useAuth();

  const { data: stats, isLoading } = useQuery<StatsData>({
    queryKey: ["/api/stats"],
  });

  const facultyCount = stats?.faculty?.length || 0;
  const courseCount = stats?.courses?.length || 0;
  const roomCount = stats?.rooms?.length || 0;
  const activeTimetables = stats?.timetables?.filter(t => t.status === 'active').length || 0;
  const totalConflicts = stats?.timetables?.reduce((acc, t) => acc + (t.conflictCount || 0), 0) || 0;
  const avgRoomUtilization = stats?.timetables?.length 
    ? Math.round(stats.timetables.reduce((acc, t) => acc + (t.roomUtilization || 0), 0) / stats.timetables.length)
    : 0;

  const recentTimetables = stats?.timetables?.slice(0, 5) || [];

  const statCards = [
    {
      title: "Total Faculty",
      value: facultyCount,
      icon: Users,
      description: "Active faculty members",
      color: "text-blue-500",
      bgColor: "bg-blue-500/10",
    },
    {
      title: "Courses",
      value: courseCount,
      icon: BookOpen,
      description: "Registered courses",
      color: "text-emerald-500",
      bgColor: "bg-emerald-500/10",
    },
    {
      title: "Rooms",
      value: roomCount,
      icon: Building,
      description: "Available rooms",
      color: "text-purple-500",
      bgColor: "bg-purple-500/10",
    },
    {
      title: "Active Timetables",
      value: activeTimetables,
      icon: Calendar,
      description: "Currently in use",
      color: "text-orange-500",
      bgColor: "bg-orange-500/10",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-dashboard-title">
          Welcome back, {user?.name || "User"}
        </h1>
        <p className="text-muted-foreground">
          Here's an overview of your scheduling system
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-md ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold" data-testid={`stat-${stat.title.toLowerCase().replace(/\s/g, '-')}`}>
                  {stat.value}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Recent Timetables
            </CardTitle>
            <CardDescription>Latest generated timetables and their status</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : recentTimetables.length > 0 ? (
              <div className="space-y-3">
                {recentTimetables.map((timetable) => (
                  <div
                    key={timetable.id}
                    className="flex items-center justify-between p-3 rounded-md bg-muted/50"
                    data-testid={`timetable-item-${timetable.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-md bg-background">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {timetable.department} - Semester {timetable.semester}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Version {timetable.versionId}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          timetable.status === "active"
                            ? "default"
                            : timetable.status === "draft"
                            ? "secondary"
                            : "outline"
                        }
                        className="text-xs"
                      >
                        {timetable.status}
                      </Badge>
                      {(timetable.conflictCount || 0) > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {timetable.conflictCount} conflicts
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Calendar className="h-12 w-12 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">No timetables generated yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Go to Generate to create your first timetable
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Quick Stats
            </CardTitle>
            <CardDescription>Key performance indicators</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Room Utilization</span>
                <span className="font-medium">{avgRoomUtilization}%</span>
              </div>
              <Progress value={avgRoomUtilization} className="h-2" />
            </div>

            <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <span className="text-sm">Total Conflicts</span>
              </div>
              <span className="font-bold" data-testid="stat-total-conflicts">{totalConflicts}</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <span className="text-sm">Active Schedules</span>
              </div>
              <span className="font-bold">{activeTimetables}</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-md bg-muted/50">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-500" />
                <span className="text-sm">Draft Schedules</span>
              </div>
              <span className="font-bold">
                {stats?.timetables?.filter(t => t.status === 'draft').length || 0}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
