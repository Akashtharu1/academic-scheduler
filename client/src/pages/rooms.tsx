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
  Building,
  Users,
  Loader2,
  Monitor,
  FlaskConical,
  BookOpenCheck,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Room } from "@shared/schema";

const roomSchema = z.object({
  code: z.string().min(1, "Room code is required"),
  name: z.string().min(2, "Room name is required"),
  building: z.string().min(1, "Building is required"),
  capacity: z.coerce.number().min(1).max(500),
  type: z.enum(["lecture", "lab", "tutorial"]),
});

type RoomFormValues = z.infer<typeof roomSchema>;

const roomTypeConfig = {
  lecture: { icon: BookOpenCheck, color: "text-blue-500", bg: "bg-blue-500/10" },
  lab: { icon: FlaskConical, color: "text-purple-500", bg: "bg-purple-500/10" },
  tutorial: { icon: Monitor, color: "text-emerald-500", bg: "bg-emerald-500/10" },
};

export default function RoomsPage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [deletingRoom, setDeletingRoom] = useState<Room | null>(null);

  const { data: rooms, isLoading } = useQuery<Room[]>({
    queryKey: ["/api/rooms"],
  });

  const form = useForm<RoomFormValues>({
    resolver: zodResolver(roomSchema),
    defaultValues: {
      code: "",
      name: "",
      building: "",
      capacity: 30,
      type: "lecture",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: RoomFormValues) => apiRequest("POST", "/api/rooms", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Success", description: "Room added successfully" });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: RoomFormValues & { id: string }) =>
      apiRequest("PUT", `/api/rooms/${data.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({ title: "Success", description: "Room updated successfully" });
      setIsDialogOpen(false);
      setEditingRoom(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/rooms/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Success", description: "Room removed successfully" });
      setDeletingRoom(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const filteredRooms = rooms?.filter(
    (r) =>
      r.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.building.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const onSubmit = (data: RoomFormValues) => {
    if (editingRoom) {
      updateMutation.mutate({ ...data, id: editingRoom.id });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (room: Room) => {
    setEditingRoom(room);
    form.reset({
      code: room.code,
      name: room.name,
      building: room.building,
      capacity: room.capacity,
      type: room.type as "lecture" | "lab" | "tutorial",
    });
    setIsDialogOpen(true);
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingRoom(null);
    form.reset();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-rooms-title">
            Room Management
          </h1>
          <p className="text-muted-foreground">
            Manage classrooms, labs, and other facilities
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-room">
              <Plus className="h-4 w-4 mr-2" />
              Add Room
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingRoom ? "Edit Room" : "Add New Room"}
              </DialogTitle>
              <DialogDescription>
                {editingRoom
                  ? "Update room details"
                  : "Add a new room to the system"}
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
                        <FormLabel>Room Code</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="A101"
                            data-testid="input-room-code"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="building"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Building</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Main Building"
                            data-testid="input-room-building"
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
                      <FormLabel>Room Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Lecture Hall A"
                          data-testid="input-room-name"
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
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Room Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-room-type">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="lecture">Lecture Hall</SelectItem>
                            <SelectItem value="lab">Laboratory</SelectItem>
                            <SelectItem value="tutorial">Tutorial Room</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="capacity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Capacity</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={1}
                            max={500}
                            data-testid="input-room-capacity"
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
                    data-testid="button-submit-room"
                  >
                    {(createMutation.isPending || updateMutation.isPending) && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {editingRoom ? "Update" : "Add"} Room
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
            placeholder="Search rooms..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
            data-testid="input-search-rooms"
          />
        </div>
        <Badge variant="secondary" className="text-xs">
          {filteredRooms?.length || 0} rooms
        </Badge>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredRooms && filteredRooms.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredRooms.map((room) => {
            const typeConfig = roomTypeConfig[room.type as keyof typeof roomTypeConfig] || roomTypeConfig.lecture;
            const TypeIcon = typeConfig.icon;
            
            return (
              <Card key={room.id} data-testid={`card-room-${room.id}`}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`p-2.5 rounded-md ${typeConfig.bg}`}>
                        <TypeIcon className={`h-5 w-5 ${typeConfig.color}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold" data-testid={`text-room-name-${room.id}`}>
                            {room.code}
                          </h3>
                          <Badge variant="outline" className="text-xs capitalize">
                            {room.type}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          {room.name}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-4 pt-4 border-t">
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Building className="h-3.5 w-3.5" />
                      <span>{room.building}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      <span>{room.capacity} seats</span>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(room)}
                      data-testid={`button-edit-room-${room.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeletingRoom(room)}
                      data-testid={`button-delete-room-${room.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Building className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <CardTitle className="text-lg mb-1">No rooms found</CardTitle>
            <CardDescription>
              {searchQuery
                ? "Try adjusting your search query"
                : "Add your first room to get started"}
            </CardDescription>
          </CardContent>
        </Card>
      )}

      <AlertDialog
        open={!!deletingRoom}
        onOpenChange={() => setDeletingRoom(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Room</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {deletingRoom?.code} - {deletingRoom?.name}? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingRoom && deleteMutation.mutate(deletingRoom.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-room"
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
