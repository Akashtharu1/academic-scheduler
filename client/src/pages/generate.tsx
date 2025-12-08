import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Wand2,
  Play,
  Settings2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Zap,
  Brain,
  Calculator,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Faculty, Course, Room, Timetable } from "@shared/schema";

const generateSchema = z.object({
  department: z.string().min(1, "Department is required"),
  semester: z.coerce.number().min(1).max(8),
  method: z.enum(["GA", "DRL", "OR"]),
  hardPenalty: z.number().min(0).max(100),
  teacherPref: z.number().min(0).max(100),
  roomUtil: z.number().min(0).max(100),
});

type GenerateFormValues = z.infer<typeof generateSchema>;

interface StatsData {
  faculty: Faculty[];
  courses: Course[];
  rooms: Room[];
  timetables: Timetable[];
}

const methodConfig = {
  GA: {
    name: "Genetic Algorithm",
    description: "Evolution-based optimization for complex constraints",
    icon: Zap,
    color: "text-orange-500",
    bg: "bg-orange-500/10",
  },
  DRL: {
    name: "Deep Reinforcement Learning",
    description: "AI-powered learning for adaptive scheduling",
    icon: Brain,
    color: "text-purple-500",
    bg: "bg-purple-500/10",
  },
  OR: {
    name: "Operations Research",
    description: "Mathematical optimization for optimal solutions",
    icon: Calculator,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
};

export default function GeneratePage() {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [generationResult, setGenerationResult] = useState<any>(null);

  const { data: stats } = useQuery<StatsData>({
    queryKey: ["/api/stats"],
  });

  const departments = [...new Set(stats?.courses?.map(c => c.department) || [])];
  const semesters = [...new Set(stats?.courses?.map(c => c.semester) || [])].sort();

  const form = useForm<GenerateFormValues>({
    resolver: zodResolver(generateSchema),
    defaultValues: {
      department: "",
      semester: 1,
      method: "GA",
      hardPenalty: 80,
      teacherPref: 60,
      roomUtil: 70,
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (data: GenerateFormValues) => {
      setIsGenerating(true);
      setProgress(0);
      setGenerationResult(null);

      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + Math.random() * 15, 90));
      }, 500);

      try {
        const result = await apiRequest("POST", "/api/timetables/generate", {
          deptId: data.department,
          semester: data.semester,
          method: data.method,
          weights: {
            hardPenalty: data.hardPenalty,
            teacherPref: data.teacherPref,
            roomUtil: data.roomUtil,
          },
        });
        
        clearInterval(progressInterval);
        setProgress(100);
        return result;
      } catch (error) {
        clearInterval(progressInterval);
        throw error;
      }
    },
    onSuccess: (data) => {
      setGenerationResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/timetables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Timetable Generated",
        description: `Successfully created timetable with ${data.timetable?.conflictCount || 0} conflicts`,
      });
      setTimeout(() => setIsGenerating(false), 1000);
    },
    onError: (error: any) => {
      setIsGenerating(false);
      setProgress(0);
      toast({
        title: "Generation Failed",
        description: error.message || "Could not generate timetable",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: GenerateFormValues) => {
    generateMutation.mutate(data);
  };

  const selectedMethod = form.watch("method");
  const methodInfo = methodConfig[selectedMethod];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-generate-title">
          Generate Timetable
        </h1>
        <p className="text-muted-foreground">
          Create optimized schedules using advanced algorithms
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                Configuration
              </CardTitle>
              <CardDescription>
                Set up your timetable generation parameters
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="department"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Department</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-gen-department">
                                <SelectValue placeholder="Select department" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {departments.map(dept => (
                                <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="semester"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Semester</FormLabel>
                          <Select 
                            onValueChange={(v) => field.onChange(parseInt(v))} 
                            value={field.value.toString()}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-gen-semester">
                                <SelectValue placeholder="Select semester" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {[1, 2, 3, 4, 5, 6, 7, 8].map(sem => (
                                <SelectItem key={sem} value={sem.toString()}>Semester {sem}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="method"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Algorithm</FormLabel>
                        <div className="grid gap-3 sm:grid-cols-3">
                          {(Object.keys(methodConfig) as Array<keyof typeof methodConfig>).map((method) => {
                            const config = methodConfig[method];
                            const Icon = config.icon;
                            const isSelected = field.value === method;
                            
                            return (
                              <div
                                key={method}
                                onClick={() => field.onChange(method)}
                                className={`p-4 rounded-lg border cursor-pointer transition-all ${
                                  isSelected 
                                    ? "border-primary bg-primary/5" 
                                    : "border-border hover:border-primary/50"
                                }`}
                                data-testid={`option-method-${method}`}
                              >
                                <div className="flex items-center gap-2 mb-2">
                                  <div className={`p-1.5 rounded ${config.bg}`}>
                                    <Icon className={`h-4 w-4 ${config.color}`} />
                                  </div>
                                  <span className="font-medium text-sm">{method}</span>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {config.name}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Optimization Weights</h4>
                    <FormField
                      control={form.control}
                      name="hardPenalty"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between">
                            <FormLabel className="text-sm">Hard Constraint Penalty</FormLabel>
                            <span className="text-sm text-muted-foreground">{field.value}%</span>
                          </div>
                          <FormControl>
                            <Slider
                              min={0}
                              max={100}
                              step={5}
                              value={[field.value]}
                              onValueChange={(v) => field.onChange(v[0])}
                              data-testid="slider-hard-penalty"
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            Importance of avoiding hard conflicts
                          </FormDescription>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="teacherPref"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between">
                            <FormLabel className="text-sm">Teacher Preferences</FormLabel>
                            <span className="text-sm text-muted-foreground">{field.value}%</span>
                          </div>
                          <FormControl>
                            <Slider
                              min={0}
                              max={100}
                              step={5}
                              value={[field.value]}
                              onValueChange={(v) => field.onChange(v[0])}
                              data-testid="slider-teacher-pref"
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            Weight given to faculty availability preferences
                          </FormDescription>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="roomUtil"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between">
                            <FormLabel className="text-sm">Room Utilization</FormLabel>
                            <span className="text-sm text-muted-foreground">{field.value}%</span>
                          </div>
                          <FormControl>
                            <Slider
                              min={0}
                              max={100}
                              step={5}
                              value={[field.value]}
                              onValueChange={(v) => field.onChange(v[0])}
                              data-testid="slider-room-util"
                            />
                          </FormControl>
                          <FormDescription className="text-xs">
                            Optimization for efficient room usage
                          </FormDescription>
                        </FormItem>
                      )}
                    />
                  </div>

                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    disabled={isGenerating || !form.formState.isValid}
                    data-testid="button-generate"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        Generate Timetable
                      </>
                    )}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          {isGenerating && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Generation Progress</span>
                    <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                  <p className="text-xs text-muted-foreground text-center">
                    Optimizing schedule using {methodInfo.name}...
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {generationResult && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-emerald-600">
                  <CheckCircle2 className="h-5 w-5" />
                  Generation Complete
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="p-4 rounded-lg bg-muted/50 text-center">
                    <p className="text-2xl font-bold">
                      {generationResult.timetable?.conflictCount || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Conflicts</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50 text-center">
                    <p className="text-2xl font-bold">
                      {generationResult.timetable?.roomUtilization || 0}%
                    </p>
                    <p className="text-xs text-muted-foreground">Room Utilization</p>
                  </div>
                  <div className="p-4 rounded-lg bg-muted/50 text-center">
                    <p className="text-2xl font-bold">
                      {generationResult.timetable?.teacherLoad || 0}%
                    </p>
                    <p className="text-xs text-muted-foreground">Teacher Load</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wand2 className="h-5 w-5" />
                Quick Stats
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Available Faculty</span>
                <Badge variant="secondary">{stats?.faculty?.length || 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Courses</span>
                <Badge variant="secondary">{stats?.courses?.length || 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Available Rooms</span>
                <Badge variant="secondary">{stats?.rooms?.length || 0}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Existing Timetables</span>
                <Badge variant="secondary">{stats?.timetables?.length || 0}</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Selected Algorithm</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`p-4 rounded-lg ${methodInfo.bg}`}>
                <div className="flex items-center gap-2 mb-2">
                  <methodInfo.icon className={`h-5 w-5 ${methodInfo.color}`} />
                  <span className="font-medium">{methodInfo.name}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {methodInfo.description}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
