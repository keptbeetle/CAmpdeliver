"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@acme/ui/button";
import { useTRPC } from "~/trpc/react";

const CanteenMap = dynamic(() => import("./_components/CanteenMap"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center bg-zinc-900 text-zinc-500">Loading map...</div>,
});

export default function AdminCanteensPage() {
  const router = useRouter();
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data: profile, isLoading: isProfileLoading } = useQuery(trpc.auth.getMyProfile.queryOptions());
  const { data: canteens } = useQuery(trpc.canteen.listAll.queryOptions());

  const [selectedCanteenId, setSelectedCanteenId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    latitude: 30.0,
    longitude: 70.0,
    radius: 50,
    isActive: true,
  });

  const { data: menuItems } = useQuery({
    ...trpc.menu.listByCanteen.queryOptions({ canteenId: selectedCanteenId ?? "" }),
    enabled: !!selectedCanteenId,
  });

  const [newMenuName, setNewMenuName] = useState("");
  const [newMenuPrice, setNewMenuPrice] = useState("");

  const createCanteen = useMutation(trpc.canteen.create.mutationOptions({
    onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.canteen.listAll.queryKey() }),
  }));

  const updateCanteen = useMutation(trpc.canteen.update.mutationOptions({
    onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.canteen.listAll.queryKey() }),
  }));

  const deleteCanteen = useMutation(trpc.canteen.delete.mutationOptions({
    onSuccess: () => {
      setSelectedCanteenId(null);
      void queryClient.invalidateQueries({ queryKey: trpc.canteen.listAll.queryKey() });
    },
  }));

  const createMenu = useMutation(trpc.menu.create.mutationOptions({
    onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.menu.listByCanteen.queryKey() }),
  }));

  const updateMenu = useMutation(trpc.menu.update.mutationOptions({
    onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.menu.listByCanteen.queryKey() }),
  }));

  if (isProfileLoading) return <div className="p-12 text-white">Loading...</div>;
  if (profile?.role !== "ADMIN") return <div className="p-12 text-white">Access Denied</div>;

  const handleSaveCanteen = () => {
    if (selectedCanteenId) {
      updateCanteen.mutate({ id: selectedCanteenId, ...formData });
    } else {
      createCanteen.mutate(formData);
    }
  };


  const handleAddMenu = () => {
    if (!selectedCanteenId || !newMenuName || !newMenuPrice) return;
    createMenu.mutate({
      canteenId: selectedCanteenId,
      name: newMenuName,
      price: Math.round(parseFloat(newMenuPrice) * 100), // convert to paise
      isAvailable: true,
    });
    setNewMenuName("");
    setNewMenuPrice("");
  };

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-white">
      <header className="flex items-center justify-between border-b border-white/10 bg-zinc-900/50 p-4">
        <h1 className="text-xl font-bold">Admin: Canteen Management</h1>
        <Button onClick={() => router.push("/")} variant="outline" className="text-zinc-300">
          Back to Dashboard
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-1/3 overflow-y-auto border-r border-white/10 bg-zinc-900/20 p-6">
          <h2 className="mb-4 text-lg font-semibold">Canteens</h2>
          
          <Button 
            onClick={() => {
              setSelectedCanteenId(null);
              setFormData({ name: "", latitude: 30.0, longitude: 70.0, radius: 50, isActive: true });
            }} 
            className="mb-4 w-full"
          >
            + Add New Canteen
          </Button>

          <div className="space-y-2">
            {canteens?.map((c) => (
              <div 
                key={c.id} 
                className={`cursor-pointer rounded-lg border p-3 ${selectedCanteenId === c.id ? "border-purple-500 bg-purple-500/10" : "border-white/10 hover:bg-white/5"}`}
                onClick={() => {
                  setSelectedCanteenId(c.id);
                  setFormData({ name: c.name, latitude: c.latitude, longitude: c.longitude, radius: c.radius, isActive: c.isActive });
                }}
              >
                <div className="font-semibold">{c.name}</div>
                <div className="text-xs text-zinc-400">{c.isActive ? "Active" : "Inactive"}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex w-2/3 flex-col overflow-y-auto p-6">
          <div className="mb-6 rounded-xl border border-white/10 bg-zinc-900/40 p-6">
            <h2 className="mb-4 text-lg font-semibold">{selectedCanteenId ? "Edit Canteen" : "New Canteen"}</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm text-zinc-400">Name</label>
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
                  onChange={(e) => setFormData(prev => ({ ...prev, radius: parseInt(e.target.value) || 50 }))}
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
              <CanteenMap 
                latitude={formData.latitude}
                longitude={formData.longitude}
                radius={formData.radius}
                onLocationChange={(lat, lng) => setFormData(prev => ({ ...prev, latitude: lat, longitude: lng }))}
              />
            </div>
            
            <div className="mt-4 flex justify-between">
              {selectedCanteenId ? (
                <Button 
                  onClick={() => {
                    if (confirm("Are you sure you want to delete this canteen? This will remove all associated menu items.")) {
                      deleteCanteen.mutate({ id: selectedCanteenId });
                    }
                  }} 
                  variant="destructive"
                >
                  Delete Canteen
                </Button>
              ) : <div />}
              <Button onClick={handleSaveCanteen} className="bg-purple-600 hover:bg-purple-500">
                {selectedCanteenId ? "Save Changes" : "Create Canteen"}
              </Button>
            </div>
          </div>

          {selectedCanteenId && (
            <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-6">
              <h2 className="mb-4 text-lg font-semibold">Menu Items</h2>
              
              <div className="mb-4 flex gap-2">
                <input 
                  type="text" 
                  placeholder="Item Name" 
                  value={newMenuName}
                  onChange={(e) => setNewMenuName(e.target.value)}
                  className="flex-1 rounded-md border border-white/10 bg-black/50 p-2 text-white"
                />
                <input 
                  type="number" 
                  placeholder="Price (₹)" 
                  value={newMenuPrice}
                  onChange={(e) => setNewMenuPrice(e.target.value)}
                  className="w-24 rounded-md border border-white/10 bg-black/50 p-2 text-white"
                />
                <Button onClick={handleAddMenu} className="bg-green-600 hover:bg-green-500">Add</Button>
              </div>

              <div className="space-y-2">
                {menuItems?.map(item => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg border border-white/5 bg-zinc-900 p-3">
                    <div>
                      <div className="font-semibold">{item.name}</div>
                      <div className="text-sm text-zinc-400">₹{(item.price / 100).toFixed(2)}</div>
                    </div>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm">
                        <input 
                          type="checkbox" 
                          checked={item.isAvailable}
                          onChange={(e) => updateMenu.mutate({ id: item.id, isAvailable: e.target.checked })}
                        />
                        Available
                      </label>
                    </div>
                  </div>
                ))}
                {menuItems?.length === 0 && <div className="text-zinc-500">No items added yet.</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
