import { Transfer, TransferStatus } from "@citizenwallet/sdk";
import { create } from "zustand";

export type TransferStore = {
  transfers: Transfer[];
  totalTransfers: number;
  totalAmount: number;
  fromDate: Date;
  loading: boolean;
  addTransfers: (transfers: Transfer[]) => void;
  putTransfers: (transfers: Transfer[]) => void;
  clearTransfers: () => void;
  setDate: (date: Date) => void;
  startLoadingFromDate: (date: Date) => void;
  stopLoadingFromDate: () => void;
};

const getInitialState = () => ({
  transfers: [],
  totalTransfers: 0,
  totalAmount: 0,
  fromDate: new Date(),
  loading: false,
});

export const useTransferStore = create<TransferStore>((set) => ({
  ...getInitialState(),
  addTransfers: (transfers: Transfer[]) =>
    set((state) => {
      const newTransfers = [...transfers, ...state.transfers];

      return {
        transfers: newTransfers,
        totalTransfers: newTransfers.length,
        totalAmount: newTransfers.reduce(
          (acc, transfer) => acc + transfer.value,
          0
        ),
      };
    }),
  putTransfers: (transfers: Transfer[]) =>
    set((state) => {
      const existingTransfers = [...state.transfers];

      // add or update the transfers based on their hash
      for (const transfer of transfers) {
        const index = existingTransfers.findIndex(
          (t) => t.hash === transfer.hash
        );
        if (index === -1) {
          existingTransfers.unshift(transfer);
        } else {
          existingTransfers[index] = transfer;
        }
      }

      existingTransfers.sort((a, b) => {
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });

      return {
        transfers: existingTransfers,
        totalTransfers: existingTransfers.length,
        totalAmount: existingTransfers.reduce(
          (acc, transfer) => acc + transfer.value,
          0
        ),
      };
    }),
  clearTransfers: () => set(getInitialState()),
  setDate: (date: Date) => set({ fromDate: date }),
  startLoadingFromDate: (date: Date) =>
    set({
      fromDate: date,
      loading: true,
      transfers: [],
      totalAmount: 0,
      totalTransfers: 0,
    }),
  stopLoadingFromDate: () => set({ loading: false }),
}));