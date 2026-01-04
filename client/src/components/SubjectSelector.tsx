import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, X, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { Course } from "@shared/schema";

interface SubjectSelectorProps {
  value: string[];
  onChange: (subjects: string[]) => void;
  department?: string;
  error?: string;
}

export function SubjectSelector({ value = [], onChange, department, error }: SubjectSelectorProps) {
  const { data: courses } = useQuery<Course[]>({
    queryKey: ["/api/courses"],
  });

  // Filter courses by department if specified
  const filteredCourses = department 
    ? courses?.filter(c => c.department === department)
    : courses;

  // Group courses by semester
  const coursesBySemester = filteredCourses?.reduce((acc, course) => {
    const sem = course.semester;
    if (!acc[sem]) acc[sem] = [];
    acc[sem].push(course);
    return acc;
  }, {} as Record<number, Course[]>) || {};

  const handleToggle = (courseCode: string) => {
    if (value.includes(courseCode)) {
      onChange(value.filter(c => c !== courseCode));
    } else {
      onChange([...value, courseCode]);
    }
  };

  const handleSelectAll = () => {
    const allCodes = filteredCourses?.map(c => c.code) || [];
    onChange(allCodes);
  };

  const handleClearAll = () => {
    onChange([]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-muted-foreground" />
          <Label className="text-base font-medium">Preferred Subjects</Label>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={handleSelectAll}>
            Select All
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={handleClearAll}>
            Clear
          </Button>
        </div>
      </div>
      
      <p className="text-sm text-muted-foreground">
        Select the courses this faculty member prefers to teach. Leave empty to allow any course.
      </p>

      {/* Selected subjects badges */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 p-2 bg-muted/50 rounded-md">
          {value.map(code => {
            const course = courses?.find(c => c.code === code);
            return (
              <Badge key={code} variant="secondary" className="gap-1">
                {code} - {course?.name || 'Unknown'}
                <X 
                  className="h-3 w-3 cursor-pointer hover:text-destructive" 
                  onClick={() => handleToggle(code)}
                />
              </Badge>
            );
          })}
        </div>
      )}

      <ScrollArea className="h-[200px] border rounded-md p-3">
        {Object.keys(coursesBySemester).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No courses available{department ? ` for ${department}` : ''}
          </p>
        ) : (
          <div className="space-y-4">
            {Object.entries(coursesBySemester)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([semester, semCourses]) => (
                <div key={semester}>
                  <h4 className="text-sm font-medium mb-2 text-muted-foreground">
                    Semester {semester}
                  </h4>
                  <div className="space-y-2">
                    {semCourses.map(course => (
                      <div key={course.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={course.code}
                          checked={value.includes(course.code)}
                          onCheckedChange={() => handleToggle(course.code)}
                        />
                        <label
                          htmlFor={course.code}
                          className="text-sm cursor-pointer flex-1"
                        >
                          <span className="font-medium">{course.code}</span>
                          <span className="text-muted-foreground ml-2">- {course.name}</span>
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </ScrollArea>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
