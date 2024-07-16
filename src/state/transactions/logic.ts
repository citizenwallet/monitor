import {
  Config,
  ConfigToken,
  IndexerService,
  Transfer,
} from "@citizenwallet/sdk";
import { TransferStore, useTransferStore } from "./state";
import { useMemo } from "react";
import { StoreApi, UseBoundStore } from "zustand";
import { delay } from "@/lib/delay";
import { off } from "process";
import { getTransactions } from "@/lib/opencollective";
type ExtendedTransfer = Transfer & {
  fromProfile?: {
    name: string;
    imgsrc: string;
  };
  data: {
    description: string;
    value: number;
    currency: string;
    valueUsd: number;
    via: string;
  };
};

const getRandomNumber = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

class TransferLogic {
  store: TransferStore;
  storeGetter: () => TransferStore;
  token: ConfigToken;
  communitySlug: string;
  indexer: IndexerService;
  accountAddress: string | undefined;
  onNewTransactions?: ([]) => void;

  constructor(
    config: Config,
    accountAddress: string | undefined,
    store: () => TransferStore,
    onNewTransactions?: ([]) => void
  ) {
    this.store = store();
    this.storeGetter = store;
    this.token = config.token;
    this.communitySlug = config.community.alias;
    this.accountAddress = accountAddress;
    this.onNewTransactions = onNewTransactions;
    this.indexer = new IndexerService(config.indexer);
  }

  private listenerInterval: ReturnType<typeof setInterval> | undefined;
  private listenerIntervalGiveth: ReturnType<typeof setInterval> | undefined;
  private listenerIntervalOpenCollective:
    | ReturnType<typeof setInterval>
    | undefined;
  private listenMaxDate = new Date();
  private listenerFetchLimit = 10;

  processNewTransfers(transfers: Transfer[]) {
    if (transfers.length > 0) {
      // new items, move the max date to the latest one
      this.listenMaxDate = new Date();
      this.onNewTransactions?.(transfers);
    }

    if (transfers.length === 0) {
      // nothing new to add
      return;
    }

    // new items, add them to the store
    this.store.putTransfers(transfers);
  }

  listen() {
    try {
      this.listenerInterval = setInterval(async () => {
        const params = {
          fromDate: this.listenMaxDate.toISOString(),
          limit: this.listenerFetchLimit,
          offset: 0,
        };
        console.log("listening for new transfers", this.accountAddress, params);
        try {
          const { array: transfers = [] } = this.accountAddress
            ? await this.indexer.getNewTransfers(
                this.token.address,
                this.accountAddress,
                params
              )
            : await this.indexer.getAllNewTransfers(this.token.address, params);

          this.processNewTransfers(transfers);
        } catch (e) {
          console.error("Error fetching transactions", e);
          return;
        }
      }, 1500);

      if (
        this.accountAddress === "0xE5c30d9f83C2FfFf6995d27F340F2BdBB997747E" // commonshub
      ) {
        this.listenerIntervalOpenCollective = setInterval(async () => {
          const data = await getTransactions(
            "commonshub-brussels",
            this.listenMaxDate,
            undefined,
            this.loaderFetchLimit
          );
          console.log(">>> logic: data from opencollective", data);
          if (data.length > 0) {
            this.processNewTransfers(
              data.map((transfer: any) => {
                transfer.to = "0xE5c30d9f83C2FfFf6995d27F340F2BdBB997747E";
                return transfer;
              })
            );
          }
        }, 5000);
      }
      if (
        this.accountAddress === "0x32330e05494177CF452F4093290306c4598ddA98" // regenvillage
      ) {
        this.listenerIntervalGiveth = setInterval(async () => {
          console.log(
            "listening for new transfers on giveth",
            this.accountAddress
          );
          try {
            const projectId = 1871;
            const projectAddress = this.accountAddress;
            const data = await fetch(
              `/api/giveth?projectId=${projectId}&projectAddress=${projectAddress}&fromDate=${this.listenMaxDate.toISOString()}`
            );
            const res = await data.json();
            console.log(">>> response from /api/giveth", res);
            if (res.transfers.length > 0) {
              this.processNewTransfers(res.transfers);
            }
          } catch (e) {
            console.error("Error fetching transactions from giveth", e);
            return;
          }
        }, 5000);
      }

      return () => {
        clearInterval(this.listenerInterval);
        this.listenerIntervalGiveth &&
          clearInterval(this.listenerIntervalGiveth);
        this.listenerIntervalOpenCollective &&
          clearInterval(this.listenerIntervalOpenCollective);
      };
    } catch (_) {}
    return () => {};
  }

  triggerNewTransaction(tx: Transfer) {
    this.onNewTransactions?.([tx]);
    this.store.putTransfers([tx]);
  }

  clearTransfers() {
    this.store.clearTransfers();
    this.store.setDate(new Date());
  }

  private loaderFetchLimit = 100;

  async loadFrom(date: Date, offset: number = 0): Promise<void | undefined> {
    try {
      if (offset === 0) {
        this.store.startLoadingFromDate(date);
      }

      const params = {
        fromDate: date.toISOString(),
        limit: this.loaderFetchLimit,
        offset,
      };

      const { array: transfers = [], meta } = this.accountAddress
        ? await this.indexer.getNewTransfers(
            this.token.address,
            this.accountAddress,
            params
          )
        : await this.indexer.getAllNewTransfers(this.token.address, params);

      if (
        this.accountAddress === "0xE5c30d9f83C2FfFf6995d27F340F2BdBB997747E" // commons hub
      ) {
        try {
          const data = await getTransactions(
            "commonshub-brussels",
            date,
            undefined,
            this.loaderFetchLimit
          );
          console.log(">>> logic: data from opencollective", data);
          if (data.length > 0) {
            data.map((transfer: any) => {
              transfer.to = "0xE5c30d9f83C2FfFf6995d27F340F2BdBB997747E";
              transfers.push(transfer);
            });
          }
        } catch (e) {
          console.error("Unable to fetch transactions from open collective", e);
        }
      }
      if (
        this.accountAddress === "0x32330e05494177CF452F4093290306c4598ddA98" // regenvillage
      ) {
        const projectId = 1871;
        const projectAddress = this.accountAddress;
        const apiCall = `/api/giveth?projectId=${projectId}&projectAddress=${projectAddress}&take=${
          this.loaderFetchLimit
        }&skip=${offset}&fromDate=${date.toISOString()}`;
        console.log(">>> apiCall", apiCall);
        const data = await fetch(apiCall);
        const res = await data.json();
        if (res.transfers.length > 0) {
          transfers.push(...res.transfers);
        }

        const extraTransfers = [
          {
            name: "Superchain",
            date: "2024-07-04",
            amount: 10000,
            avatar:
              "https://pbs.twimg.com/profile_images/1696769956245807105/xGnB-Cdl_400x400.png",
          },
          {
            name: "Tickets via lu.ma",
            date: "2024-07-11",
            amount: 6105.78,
            avatar:
              "https://pbs.twimg.com/profile_images/1765103917749215233/qK72DSBL_400x400.jpg",
          },
          {
            name: "Blast.io",
            date: "2024-07-04",
            amount: 6000,
            avatar:
              "https://pbs.twimg.com/profile_images/1805963937449381888/aNF8BIJo_400x400.jpg",
          },
          {
            name: "Metagov",
            date: "2024-07-04",
            amount: 5000,
            avatar:
              "https://pbs.twimg.com/profile_images/1405958117444173831/JUsPuQdZ_400x400.png",
          },
          {
            name: "Gnosis",
            date: "2024-07-04",
            amount: 5000,
            avatar:
              "https://pbs.twimg.com/profile_images/1603829076346667022/6J-QZXPB_400x400.jpg",
          },
          {
            name: "Kevin Owocki",
            date: "2024-07-04",
            amount: 5000,
            avatar:
              "https://pbs.twimg.com/profile_images/1769808533304844288/QXNWAaFS_400x400.jpg",
          },
          {
            name: "Octant",
            date: "2024-07-04",
            amount: 5000,
            avatar:
              "https://pbs.twimg.com/profile_images/1647279005513424898/E7aQiEty_400x400.png",
          },
          {
            name: "Proof of Vibe",
            date: "2024-07-04",
            amount: 2286,
            avatar:
              "https://pbs.twimg.com/profile_images/1544508987009269761/SU124WxA_400x400.jpg",
          },
          {
            name: "Grants Funding Forum tickets",
            date: "2024-07-04",
            amount: 1500.21,
            avatar:
              "https://images.lumacdn.com/cdn-cgi/image/format=auto,fit=cover,dpr=2,background=white,quality=75,width=400,height=400/event-covers/h2/c185b44c-c323-484b-94ff-3ded0f6e586b",
          },
        ];

        if (extraTransfers.length > 0 && offset === 0) {
          extraTransfers.map((tx) => {
            const transfer: ExtendedTransfer = {
              nonce: 0,
              status: "success",
              hash: "0x" + Math.random().toString(16).substring(2, 64),
              tx_hash: "0x" + Math.random().toString(16).substring(2, 64),
              token_id: 1,
              value: tx.amount * 10 ** 6,
              created_at: new Date(tx.date),
              from: tx.name,
              to: this.accountAddress || "",
              fromProfile: {
                name: tx.name,
                imgsrc: tx.avatar,
              },
              data: {
                description: `Sponsorship of ${tx.amount} euros`,
                value: tx.amount,
                currency: "EUR",
                valueUsd: Math.round(1.08 * tx.amount),
                via: "IBAN",
              },
            };
            transfers.push(transfer);
          });
        }
      }

      if (transfers.length === 0) {
        this.store.stopLoadingFromDate();
        return;
      }

      // new items, add them to the store
      console.log(">>> putTransfers", transfers);
      this.store.putTransfers(transfers);

      const isLastPage = transfers.length < this.loaderFetchLimit;
      if (isLastPage) {
        this.store.stopLoadingFromDate();
        return;
      }

      const randomNumber = getRandomNumber(500, 2000);
      await delay(randomNumber);

      const nextOffset = offset + this.loaderFetchLimit;

      return this.loadFrom(date, nextOffset);
    } catch (e) {
      console.error("loadFrom error", e);
      this.store.stopLoadingFromDate();
    }
  }
  setAccount(account: string | null) {
    this.store.setAccount(account);
  }
}

export const useTransfers = (
  config: Config,
  accountAddress?: string,
  onNewTransactions?: ([]) => void
): [UseBoundStore<StoreApi<TransferStore>>, TransferLogic] => {
  const transferStore = useTransferStore;

  const transferLogic = useMemo(
    () =>
      new TransferLogic(
        config,
        accountAddress,
        () => transferStore.getState(),
        onNewTransactions
      ),
    [config, transferStore, accountAddress, onNewTransactions]
  );

  return [transferStore, transferLogic];
};
