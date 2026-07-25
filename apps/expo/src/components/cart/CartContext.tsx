import React, { createContext, useContext, useState } from "react";

export interface CartItem {
  id: string;
  name: string;
  price: number; // in paise
  quantity: number;
  canteenId: string;
  canteenName: string;
}

interface CartContextType {
  items: CartItem[];
  canteenId: string | null;
  canteenName: string | null;
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number; // in paise
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [canteenId, setCanteenId] = useState<string | null>(null);
  const [canteenName, setCanteenName] = useState<string | null>(null);

  const addItem = (newItem: Omit<CartItem, "quantity">) => {
    // If adding item from a different canteen, clear previous items
    if (canteenId && canteenId !== newItem.canteenId) {
      setItems([{ ...newItem, quantity: 1 }]);
      setCanteenId(newItem.canteenId);
      setCanteenName(newItem.canteenName);
      return;
    }

    setCanteenId(newItem.canteenId);
    setCanteenName(newItem.canteenName);

    setItems((prev) => {
      const existingIndex = prev.findIndex((i) => i.id === newItem.id);
      if (existingIndex > -1) {
        const updated = [...prev];
        const existing = updated[existingIndex];
        if (existing) {
          updated[existingIndex] = {
            ...existing,
            quantity: existing.quantity + 1,
          };
        }
        return updated;
      }
      return [...prev, { ...newItem, quantity: 1 }];
    });
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.id === id);
      if (!existing) return prev;

      if (existing.quantity <= 1) {
        const filtered = prev.filter((i) => i.id !== id);
        if (filtered.length === 0) {
          setCanteenId(null);
          setCanteenName(null);
        }
        return filtered;
      }

      return prev.map((i) =>
        i.id === id ? { ...i, quantity: i.quantity - 1 } : i,
      );
    });
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      removeItem(id);
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, quantity } : i)),
    );
  };

  const clearCart = () => {
    setItems([]);
    setCanteenId(null);
    setCanteenName(null);
  };

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );

  return (
    <CartContext.Provider
      value={{
        items,
        canteenId,
        canteenName,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        totalItems,
        totalPrice,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
