import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  BookOpen,
  Clock,
  GraduationCap,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Course } from "@shared/schema";

const courseSchema = z.object({
  code: z.string().min(2, "Course code is required"),
  name: z.string().min(2, "Course name is required"),
  department: z.string().min(1, "Department is required"),
  semester: z.coerce.number().min(1).max(8),
  credits: z.coerce.number().min(1).max(6),
  lectureHours: z.coerce.number().min(1).max(6),
  labHours: z.coerce.number().min(0).max(4).optional(),
});

type CourseFormValues = z.infer<typeof courseSchema>;

export default function CoursesPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [deletingCourse, setDeletingCourse] = useState<Course | null>(null);

  const { data: courses, isLoading } = useQuery<Course[]>({
    queryKey: ["/api/courses"],
  });

  const form = useForm<CourseFormValues>({
    resolver: zodResolver(courseSchema),
    defaultValues: {
      code: "",
      name: "",
      department: "",
      semester: 1,
      credits: 3,
      lectureHours: 3,
      labHours: 0,
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: CourseFormValues) => apiRequest("POST", "/api/courses", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Success", description: "Course added successfully" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: CourseFormValues & { id: string }) =>
      apiRequest("PUT", `/api/courses/${data.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      toast({ title: "Success", description: "Course updated successfully" });
      setIsDialogOpen(false);
      setEditingCourse(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/courses/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/courses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Success", description: "Course removed successfully" });
      setDeletingCourse(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const filteredCourses = courses?.filter(
    (c) =>
      c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.department.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const onSubmit = (data: CourseFormValues) => {
    if (editingCourse) {
      updateMutation.mutate({ ...data, id: editingCourse.id });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (course: Course) => {
    setEditingCourse(course);
    form.reset({
      code: course.code,
      name: course.name,
      department: course.department,
      semester: course.semester,
      credits: course.credits,
      lectureHours: course.lectureHours,
      labHours: course.labHours || 0,
    });
    setIsDialogOpen(true);
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingCourse(null);
    form.reset();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-courses-title">
            Course Management
          </h1>
          <p className="text-muted-foreground">
            Manage courses and their scheduling requirements
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-course">
              <Plus className="h-4 w-4 mr-2" />
              Add Course
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingCourse ? "Edit Course" : "Add New Course"}
              </DialogTitle>
              <DialogDescription>
                {editingCourse
                  ? "Update course details"
                  : "Add a new course to the system"}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Course Code</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="CS101"
                            data-testid="input-course-code"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="department"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Department</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="CS"
                            data-testid="input-course-department"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Course Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Introduction to Computer Science"
                          data-testid="input-course-name"
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
                    name="semester"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Semester</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={8}
                            data-testid="input-course-semester"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="credits"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Credits</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={6}
                            data-testid="input-course-credits"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="lectureHours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Lecture Hours/Week</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={6}
                            data-testid="input-course-lecture-hours"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="labHours"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Lab Hours/Week</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0}
                            max={4}
                            data-testid="input-course-lab-hours"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
                    data-testid="button-submit-course"
                  >
                    {(createMutation.isPending || updateMutation.isPending) && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {editingCourse ? "Update" : "Add"} Course
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search courses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-courses"
          />
        </div>
        <Badge variant="secondary" className="text-xs">
          {filteredCourses?.length || 0} courses
        </Badge>
      </div>

      <Card>
        {isLoading ? (
          <CardContent className="pt-6">
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        ) : filteredCourses && filteredCourses.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Course Name</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="text-center">Semester</TableHead>
                <TableHead className="text-center">Credits</TableHead>
                <TableHead className="text-center">Hours</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCourses.map((course) => (
                <TableRow key={course.id} data-testid={`row-course-${course.id}`}>
                  <TableCell>
                    <Badge variant="outline" className="font-mono">
                      {course.code}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{course.name}</TableCell>
                  <TableCell>{course.department}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="text-xs">
                      Sem {course.semester}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">{course.credits}</TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                      <span>{course.lectureHours}L</span>
                      {course.labHours ? <span>{course.labHours}P</span> : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(course)}
                        data-testid={`button-edit-course-${course.id}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeletingCourse(course)}
                        data-testid={`button-delete-course-${course.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BookOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <CardTitle className="text-lg mb-1">No courses found</CardTitle>
            <CardDescription>
              {searchQuery
                ? "Try adjusting your search query"
                : "Add your first course to get started"}
            </CardDescription>
          </CardContent>
        )}
      </Card>

      <AlertDialog
        open={!!deletingCourse}
        onOpenChange={() => setDeletingCourse(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Course</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deletingCourse?.code} - {deletingCourse?.name}? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingCourse && deleteMutation.mutate(deletingCourse.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-course"
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
