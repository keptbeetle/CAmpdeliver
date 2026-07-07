"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@acme/ui/button";
import { useTRPC } from "~/trpc/react";

const LandmarkMap = dynamic(() => import("./_components/LandmarkMap"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center bg-zinc-900 text-zinc-500">Loading map...</div>,
});

export default function AdminLandmarksPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: profile, isLoading: isProfileLoading } = useQuery(trpc.auth.getMyProfile.queryOptions());
  const { data: landmarks } = useQuery(trpc.landmark.listAll.queryOptions());

  const [selectedLandmarkId, setSelectedLandmarkId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    latitude: 30.0,
    longitude: 70.0,
    radius: 150,
    isActive: true,
  });

  const createLandmark = useMutation(trpc.landmark.create.mutationOptions({
    onSuccess: () => {
      alert("Landmark created successfully!");
      setFormData({ name: "", latitude: 30.0, longitude: 70.0, radius: 150, isActive: true });
      void queryClient.invalidateQueries({ queryKey: trpc.landmark.listAll.queryKey() });
    },
    onError: (e) => {
      console.error("Create Landmark Error:", e);
      alert(`Failed to create landmark: ${e.message}`);
    }
  }));

  const updateLandmark = useMutation(trpc.landmark.update.mutationOptions({
    onSuccess: () => {
      alert("Landmark updated successfully!");
      void queryClient.invalidateQueries({ queryKey: trpc.landmark.listAll.queryKey() });
    },
    onError: (e) => {
      console.error("Update Landmark Error:", e);
      alert(`Failed to update landmark: ${e.message}`);
    }
  }));

  const deleteLandmark = useMutation(trpc.landmark.delete.mutationOptions({
    onSuccess: () => {
      alert("Landmark deleted successfully!");
      setSelectedLandmarkId(null);
      void queryClient.invalidateQueries({ queryKey: trpc.landmark.listAll.queryKey() });
    },
    onError: (e) => {
      console.error("Delete Landmark Error:", e);
      alert(`Failed to delete landmark: ${e.message}`);
    }
  }));

  if (isProfileLoading) return <div className="p-12 text-white">Loading...</div>;
  if (profile?.role !== "ADMIN") return <div className="p-12 text-white">Access Denied</div>;

  const handleSaveLandmark = () => {
    if (!formData.name.trim()) {
      alert("Please enter a name for the landmark.");
      return;
    }
    if (selectedLandmarkId) {
      updateLandmark.mutate({ id: selectedLandmarkId, ...formData });
    } else {
      createLandmark.mutate(formData);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-white">
      <header className="flex items-center justify-between border-b border-white/10 bg-zinc-900/50 p-4">
        <h1 className="text-xl font-bold">Admin: Landmark Management</h1>
        <Button onClick={() => router.push("/")} variant="outline" className="text-zinc-300">
          Back to Dashboard
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-1/3 overflow-y-auto border-r border-white/10 bg-zinc-900/20 p-6">
          <h2 className="mb-4 text-lg font-semibold">Landmarks (Hostels, Academic Blocks)</h2>
          
          <Button 
            onClick={() => {
              setSelectedLandmarkId(null);
              setFormData({ name: "", latitude: 30.0, longitude: 70.0, radius: 150, isActive: true });
            }} 
            className="mb-4 w-full"
          >
            + Add New Landmark
          </Button>

          <div className="space-y-2">
            {landmarks?.map((l) => (
              <div 
                key={l.id} 
                className={`cursor-pointer rounded-lg border p-3 ${selectedLandmarkId === l.id ? "border-blue-500 bg-blue-500/10" : "border-white/10 hover:bg-white/5"}`}
                onClick={() => {
                  setSelectedLandmarkId(l.id);
                  setFormData({ name: l.name, latitude: l.latitude, longitude: l.longitude, radius: l.radius, isActive: l.isActive });
                }}
              >
                <div className="font-semibold">{l.name}</div>
                <div className="text-xs text-zinc-400">{l.isActive ? "Active" : "Inactive"}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex w-2/3 flex-col overflow-y-auto p-6">
          <div className="mb-6 rounded-xl border border-white/10 bg-zinc-900/40 p-6">
            <h2 className="mb-4 text-lg font-semibold">{selectedLandmarkId ? "Edit Landmark" : "New Landmark"}</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-zinc-400">Name (e.g. Hostel 3)</label>
                <input 
                  type="text" 
                  value={formData.name} 
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full rounded-md border border-white/10 bg-black/50 p-2 text-white"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-zinc-400">Radius (meters)</label>
                <input 
                  type="number" 
                  value={formData.radius} 
                  onChange={(e) => setFormData(prev => ({ ...prev, radius: parseInt(e.target.value) || 150 }))}
                  className="w-full rounded-md border border-white/10 bg-black/50 p-2 text-white"
                />
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <input 
                  type="checkbox" 
                  checked={formData.isActive}
                  onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
                  className="h-4 w-4"
                />
                <label className="text-sm text-zinc-400">Is Active</label>
              </div>
              <div className="space-y-2">
                <label className="text-sm text-zinc-400">Latitude (Click map to change)</label>
                <input 
                  type="text" 
                  readOnly 
                  value={formData.latitude} 
                  className="w-full rounded-md border border-white/10 bg-zinc-900/80 p-2 text-sm text-zinc-300"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-zinc-400">Longitude (Click map to change)</label>
                <input 
                  type="text" 
                  readOnly 
                  value={formData.longitude} 
                  className="w-full rounded-md border border-white/10 bg-zinc-900/80 p-2 text-sm text-zinc-300"
                />
              </div>
            </div>
            
            <div className="mt-4 h-64 w-full">
              <LandmarkMap 
                latitude={formData.latitude}
                longitude={formData.longitude}
                radius={formData.radius}
                onLocationChange={(lat, lng) => setFormData(prev => ({ ...prev, latitude: lat, longitude: lng }))}
              />
            </div>
            
            <div className="mt-4 flex justify-between">
              {selectedLandmarkId ? (
                <Button 
                  onClick={() => {
                    if (confirm("Are you sure you want to delete this landmark?")) {
                      deleteLandmark.mutate(selectedLandmarkId);
                    }
                  }} 
                  variant="destructive"
                  disabled={deleteLandmark.isPending}
                >
                  {deleteLandmark.isPending ? "Deleting..." : "Delete Landmark"}
                </Button>
              ) : <div />}
              
              <Button 
                onClick={handleSaveLandmark} 
                disabled={createLandmark.isPending || updateLandmark.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {createLandmark.isPending || updateLandmark.isPending ? "Saving..." : (selectedLandmarkId ? "Update Landmark" : "Create Landmark")}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
