import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Search, Pencil, Trash2, Users, Mail, Building2, Clock, Loader2, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AvailabilitySelector } from "@/components/AvailabilitySelector";
import { SubjectSelector } from "@/components/SubjectSelector";
import { RoomPreferenceSelector } from "@/components/RoomPreferenceSelector";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import type { Faculty } from "@shared/schema";
import type { AvailabilityData } from "@shared/availability";

const facultySchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  department: z.string().min(1, "Department is required"),
  maxHoursPerWeek: z.coerce.number().min(1).max(40),
  preferredSubjects: z.array(z.string()).optional(),
  availability: z.any().optional(),
  preferences: z.object({
    roomPreferences: z.array(z.any()).optional(),
    timePreferences: z.array(z.any()).optional(),
    subjectPreferences: z.array(z.any()).optional(),
  }).optional(),
});

type FacultyFormValues = z.infer<typeof facultySchema>;

const defaultAvailability: AvailabilityData = {
  schedule: [],
};

const defaultPreferences = {
  roomPreferences: [],
  timePreferences: [],
  subjectPreferences: [],
};

export default function FacultyPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingFaculty, setEditingFaculty] = useState<Faculty | null>(null);
  const [deletingFaculty, setDeletingFaculty] = useState<Faculty | null>(null);

  const { data: facultyList, isLoading } = useQuery<Faculty[]>({
    queryKey: ["/api/faculty"],
  });

  const form = useForm<FacultyFormValues>({
    resolver: zodResolver(facultySchema),
    defaultValues: {
      name: "",
      email: "",
      department: "",
      maxHoursPerWeek: 20,
      preferredSubjects: [],
      availability: defaultAvailability,
      preferences: defaultPreferences,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: FacultyFormValues) => apiRequest("POST", "/api/faculty", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/faculty"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Success", description: "Faculty member added" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: FacultyFormValues & { id: string }) =>
      apiRequest("PUT", `/api/faculty/${data.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/faculty"] });
      toast({ title: "Success", description: "Faculty member updated" });
      setIsDialogOpen(false);
      setEditingFaculty(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/faculty/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/faculty"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Success", description: "Faculty member removed" });
      setDeletingFaculty(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const filteredFaculty = facultyList?.filter(
    (f) =>
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.department.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const onSubmit = (data: FacultyFormValues) => {
    if (editingFaculty) {
      updateMutation.mutate({ ...data, id: editingFaculty.id });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (faculty: Faculty) => {
    setEditingFaculty(faculty);
    form.reset({
      name: faculty.name,
      email: faculty.email,
      department: faculty.department,
      maxHoursPerWeek: faculty.maxHoursPerWeek,
      preferredSubjects: (faculty as any).preferredSubjects || [],
      availability: (faculty.availability as AvailabilityData) || defaultAvailability,
      // Handle case where preferences is an array (from API) instead of object
      preferences: Array.isArray((faculty as any).preferences) 
        ? defaultPreferences 
        : ((faculty as any).preferences || defaultPreferences),
    });
    setIsDialogOpen(true);
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingFaculty(null);
    form.reset();
  };

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-faculty-title">
            Faculty Management
          </h1>
          <p className="text-muted-foreground">
            Manage faculty members and their schedules
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-faculty">
              <Plus className="h-4 w-4 mr-2" />
              Add Faculty
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>
                {editingFaculty ? "Edit Faculty" : "Add New Faculty"}
              </DialogTitle>
              <DialogDescription>
                {editingFaculty
                  ? "Update faculty member details"
                  : "Add a new faculty member to the system"}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[calc(90vh-180px)] pr-4">
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  {/* Basic Information */}
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Full Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Dr. John Smith"
                              data-testid="input-faculty-name"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="john.smith@university.edu"
                              data-testid="input-faculty-email"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="department"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Department</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Computer Science"
                                data-testid="input-faculty-department"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="maxHoursPerWeek"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Max Hours/Week</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={1}
                                max={40}
                                data-testid="input-faculty-hours"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Tabbed Sections */}
                  <div className="pt-4 border-t">
                    <Tabs defaultValue="subjects" className="w-full">
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="subjects">Subjects</TabsTrigger>
                        <TabsTrigger value="availability">Availability</TabsTrigger>
                        <TabsTrigger value="rooms">Room Prefs</TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="subjects" className="space-y-4">
                        <Controller
                          control={form.control}
                          name="preferredSubjects"
                          render={({ field, fieldState }) => (
                            <SubjectSelector
                              value={field.value || []}
                              onChange={field.onChange}
                              department={form.watch("department")}
                              error={fieldState.error?.message}
                            />
                          )}
                        />
                      </TabsContent>
                      
                      <TabsContent value="availability" className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <Label className="text-base font-medium">Availability Schedule</Label>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Select the days and time ranges when this faculty member is available to teach.
                        </p>
                        <Controller
                          control={form.control}
                          name="availability"
                          render={({ field, fieldState }) => (
                            <AvailabilitySelector
                              value={field.value || defaultAvailability}
                              onChange={field.onChange}
                              error={fieldState.error?.message}
                            />
                          )}
                        />
                      </TabsContent>
                      
                      <TabsContent value="rooms" className="space-y-4">
                        <Controller
                          control={form.control}
                          name="preferences.roomPreferences"
                          render={({ field, fieldState }) => (
                            <RoomPreferenceSelector
                              value={field.value || []}
                              onChange={field.onChange}
                              error={fieldState.error?.message}
                            />
                          )}
                        />
                      </TabsContent>
                    </Tabs>
                  </div>

                  <div className="flex justify-end gap-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleDialogClose}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={createMutation.isPending || updateMutation.isPending}
                      data-testid="button-submit-faculty"
                    >
                      {(createMutation.isPending || updateMutation.isPending) && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {editingFaculty ? "Update" : "Add"} Faculty
                    </Button>
                  </div>
                </form>
              </Form>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search faculty..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-faculty"
          />
        </div>
        <Badge variant="secondary" className="text-xs">
          {filteredFaculty?.length || 0} members
        </Badge>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredFaculty && filteredFaculty.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredFaculty.map((faculty) => (
            <Card key={faculty.id} data-testid={`card-faculty-${faculty.id}`}>
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-primary/10 text-primary font-medium">
                      {getInitials(faculty.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate" data-testid={`text-faculty-name-${faculty.id}`}>
                      {faculty.name}
                    </h3>
                    <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                      <Mail className="h-3 w-3" />
                      <span className="truncate">{faculty.email}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Building2 className="h-3 w-3" />
                        <span>{faculty.department}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{faculty.maxHoursPerWeek}h/week</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEdit(faculty)}
                    data-testid={`button-edit-faculty-${faculty.id}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeletingFaculty(faculty)}
                    data-testid={`button-delete-faculty-${faculty.id}`}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <CardTitle className="text-lg mb-1">No faculty members found</CardTitle>
            <CardDescription>
              {searchQuery
                ? "Try adjusting your search query"
                : "Add your first faculty member to get started"}
            </CardDescription>
          </CardContent>
        </Card>
      )}

      <AlertDialog
        open={!!deletingFaculty}
        onOpenChange={() => setDeletingFaculty(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Faculty Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deletingFaculty?.name}? This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingFaculty && deleteMutation.mutate(deletingFaculty.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-faculty"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
