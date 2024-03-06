import type { TransactionStore } from '@pcnv/txs-core'
import { createContext, PropsWithChildren, useContext, useEffect } from 'react'
import { useAccount, useChainId, useClient } from 'wagmi'

const TransactionsStoreContext = createContext<TransactionStore | null>(null)

type TransactionsProviderProps = PropsWithChildren<{
  store: TransactionStore
}>

export const TransactionsStoreProvider = ({ children, store }: TransactionsProviderProps) => {
  const { address } = useAccount()
  const chainId = useChainId()
  const client = useClient({ chainId })

  useEffect(() => {
    if (!client || !chainId || !address) return
    store.mount(client, address, chainId)
    return () => {
      store.unmount()
    }
  }, [client, chainId, address])

  return (
    <TransactionsStoreContext.Provider value={store}>{children}</TransactionsStoreContext.Provider>
  )
}

export const useTransactionsStore = (): TransactionStore => {
  const store = useContext(TransactionsStoreContext)
  if (!store) throw new Error('Missing <TransactionsStoreProvider />')
  return store
}
