import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Plus, X, Building2, Users, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import type { Room, RoomType } from '@shared/schema';

export interface RoomPreference {
  roomId?: string;
  roomType?: RoomType;
  building?: string;
  facilities?: string[];
  priority: 'high' | 'medium' | 'low';
  weight: number;
}

interface RoomPreferenceSelectorProps {
  value: RoomPreference[];
  onChange: (preferences: RoomPreference[]) => void;
  error?: string;
}

const ROOM_TYPES: { value: RoomType; label: string }[] = [
  { value: 'lecture', label: 'Lecture Hall' },
  { value: 'lab', label: 'Laboratory' },
  { value: 'tutorial', label: 'Tutorial Room' },
];

const PRIORITY_OPTIONS = [
  { value: 'high', label: 'High', color: 'bg-red-100 text-red-800' },
  { value: 'medium', label: 'Medium', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'low', label: 'Low', color: 'bg-green-100 text-green-800' },
] as const;

export function RoomPreferenceSelector({ value, onChange, error }: RoomPreferenceSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBuilding, setSelectedBuilding] = useState<string>('');
  const [selectedRoomType, setSelectedRoomType] = useState<string>('');
  const [showAddForm, setShowAddForm] = useState(false);

  const { data: rooms = [] } = useQuery<Room[]>({
    queryKey: ['/api/rooms'],
  });

  // Get unique buildings from rooms
  const buildings = Array.from(new Set(rooms.map(room => room.building))).sort();

  // Filter rooms based on search and filters
  const filteredRooms = rooms.filter(room => {
    const matchesSearch = room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         room.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesBuilding = !selectedBuilding || room.building === selectedBuilding;
    const matchesType = !selectedRoomType || room.type === selectedRoomType;
    
    return matchesSearch && matchesBuilding && matchesType;
  });

  const addPreference = (preference: Omit<RoomPreference, 'priority' | 'weight'>) => {
    const newPreference: RoomPreference = {
      ...preference,
      priority: 'medium',
      weight: 50,
    };
    onChange([...value, newPreference]);
    setShowAddForm(false);
  };

  const updatePreference = (index: number, updates: Partial<RoomPreference>) => {
    const updated = value.map((pref, i) => 
      i === index ? { ...pref, ...updates } : pref
    );
    onChange(updated);
  };

  const removePreference = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const addSpecificRoom = (room: Room) => {
    // Check if room is already in preferences
    const exists = value.some(pref => pref.roomId === room.id);
    if (!exists) {
      addPreference({ roomId: room.id });
    }
  };

  const addRoomTypePreference = () => {
    if (selectedRoomType) {
      addPreference({ roomType: selectedRoomType as RoomType });
      setSelectedRoomType('');
    }
  };

  const addBuildingPreference = () => {
    if (selectedBuilding) {
      addPreference({ building: selectedBuilding });
      setSelectedBuilding('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-base font-medium">Room Preferences</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Preference
        </Button>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
          {error}
        </div>
      )}

      {/* Current Preferences */}
      {value.length > 0 && (
        <div className="space-y-3">
          <Label className="text-sm font-medium text-muted-foreground">Current Preferences</Label>
          {value.map((preference, index) => (
            <Card key={index} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-2">
                    {preference.roomId && (
                      <Badge variant="outline">
                        Specific Room: {rooms.find(r => r.id === preference.roomId)?.name || preference.roomId}
                      </Badge>
                    )}
                    {preference.roomType && (
                      <Badge variant="outline">
                        Type: {ROOM_TYPES.find(t => t.value === preference.roomType)?.label}
                      </Badge>
                    )}
                    {preference.building && (
                      <Badge variant="outline">
                        Building: {preference.building}
                      </Badge>
                    )}
                    {preference.facilities && preference.facilities.length > 0 && (
                      <Badge variant="outline">
                        Facilities: {preference.facilities.join(', ')}
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs">Priority</Label>
                      <Select
                        value={preference.priority}
                        onValueChange={(priority: 'high' | 'medium' | 'low') =>
                          updatePreference(index, { priority })
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORITY_OPTIONS.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                              <span className={`px-2 py-1 rounded text-xs ${option.color}`}>
                                {option.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs">Weight: {preference.weight}</Label>
                      <Slider
                        value={[preference.weight]}
                        onValueChange={([weight]) => updatePreference(index, { weight })}
                        max={100}
                        min={0}
                        step={5}
                        className="mt-1"
                      />
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removePreference(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add Preference Form */}
      {showAddForm && (
        <Card className="p-4">
          <CardHeader className="px-0 pt-0">
            <CardTitle className="text-lg">Add Room Preference</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="space-y-4">
              {/* Quick Actions */}
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Select value={selectedRoomType} onValueChange={setSelectedRoomType}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Room Type" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROOM_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addRoomTypePreference}
                    disabled={!selectedRoomType}
                  >
                    Add Type
                  </Button>
                </div>

                <div className="flex items-center gap-2">
                  <Select value={selectedBuilding} onValueChange={setSelectedBuilding}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Building" />
                    </SelectTrigger>
                    <SelectContent>
                      {buildings.map(building => (
                        <SelectItem key={building} value={building}>
                          {building}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addBuildingPreference}
                    disabled={!selectedBuilding}
                  >
                    Add Building
                  </Button>
                </div>
              </div>

              {/* Room Search and Selection */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Or Select Specific Rooms</Label>
                
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search rooms by name or code..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                {/* Filters */}
                <div className="flex gap-2">
                  <Select value={selectedBuilding || "all"} onValueChange={(v) => setSelectedBuilding(v === "all" ? "" : v)}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Filter by building" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Buildings</SelectItem>
                      {buildings.map(building => (
                        <SelectItem key={building} value={building}>
                          {building}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={selectedRoomType || "all"} onValueChange={(v) => setSelectedRoomType(v === "all" ? "" : v)}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Filter by type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      {ROOM_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Room List */}
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {filteredRooms.map(room => {
                    const isSelected = value.some(pref => pref.roomId === room.id);
                    return (
                      <div
                        key={room.id}
                        className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                          isSelected 
                            ? 'bg-primary/10 border-primary' 
                            : 'hover:bg-muted/50'
                        }`}
                        onClick={() => !isSelected && addSpecificRoom(room)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium">{room.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {room.code} • {room.building} • {room.type}
                            </div>
                            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {room.capacity}
                              </span>
                              {room.facilities && room.facilities.length > 0 && (
                                <span className="flex items-center gap-1">
                                  <Settings className="h-3 w-3" />
                                  {room.facilities.join(', ')}
                                </span>
                              )}
                            </div>
                          </div>
                          {isSelected && (
                            <Badge variant="secondary">Selected</Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {value.length === 0 && !showAddForm && (
        <div className="text-center py-8 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No room preferences set</p>
          <p className="text-sm">Add preferences to help with room allocation</p>
        </div>
      )}
    </div>
  );
}