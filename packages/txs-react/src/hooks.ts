import type { NewTransaction, StoredTransaction, TransactionsStoreEvents } from '@pcnv/txs-core'
import { useCallback, useEffect } from 'react'
import { useTransactionsStore } from './Provider'

import useSyncExternalStoreExports from 'use-sync-external-store/shim/with-selector'
const { useSyncExternalStoreWithSelector } = useSyncExternalStoreExports

export const useRecentTransactions = <Selector = StoredTransaction[]>(
  selector: (txs: StoredTransaction[]) => Selector = (txs) => txs as Selector,
  { initialTransactions = [] }: { initialTransactions?: StoredTransaction[] } = {},
) => {
  const store = useTransactionsStore()

  const transactions = useSyncExternalStoreWithSelector(
    store.onTransactionsChange,
    store.getTransactions,
    useCallback(() => initialTransactions, [initialTransactions]),
    selector,
  )

  return transactions
}

export function useAddRecentTransaction() {
  const store = useTransactionsStore()
  return useCallback((tx: NewTransaction) => store.addTransaction(tx), [store])
}

export const useClearRecentTransactions = () => {
  const store = useTransactionsStore()
  return store.clearTransactions()
}

export const useRemoveRecentTransaction = () => {
  const store = useTransactionsStore()
  return useCallback((hash: StoredTransaction['hash']) => store.removeTransaction(hash), [store])
}

export const useTransactionsStoreEvent = <
  E extends TransactionsStoreEvents,
  T extends E['type'],
  Fn extends E extends { type: T; arg: infer A } ? (arg?: A) => void : VoidFunction,
>(
  event: T,
  callback: Fn,
) => {
  const store = useTransactionsStore()
  useEffect(() => {
    const unsubscribe = store.on(event, callback)
    return () => unsubscribe()
  }, [store, callback])
}
