import type { Address, Client, Hash, TransactionReceipt } from 'viem'
import { waitForTransactionReceipt } from 'viem/actions'
import { createEventEmitter } from './eeemitter'
import { createStorage } from './localStorage'

export type TransactionsStoreConfig = {
  /* 
    max completed transactions to keep in storage 
    (undefined keep all transactions)
  */
  maxCompletedTransactions: number | undefined
  minConfirmations: number
  localStorageKey: string
}

declare global {
  namespace Txs {
    export interface Meta extends Record<string, any> {}
  }
}

export type NewTransaction = {
  hash: string
  chainId?: number
  meta?: Txs.Meta
  minConfirmations?: number
}

export type StoredTransaction = {
  hash: Hash
  status: 'pending' | 'success' | 'reverted'
  minConfirmations: number
  chainId: number
  sentAt: number
  meta: Txs.Meta
}

const isHash = (hash: string): hash is Hash => /^0x[a-fA-F0-9]{64}$/.test(hash)

const parseNewTransaction = (
  transaction: NewTransaction,
  config: TransactionsStoreConfig,
  ctx: StoreContext,
): StoredTransaction => {
  const hash = transaction.hash
  if (!isHash(hash)) throw new Error('Invalid Transaction hash')
  return {
    hash,
    chainId: transaction.chainId || ctx.chainId,
    meta: transaction.meta || {},
    sentAt: Date.now(),
    status: 'pending',
    minConfirmations: transaction.minConfirmations || config.minConfirmations,
  }
}

const defaultConfig = {
  localStorageKey: 'transactions',
  minConfirmations: 1,
  maxCompletedTransactions: 50,
} satisfies TransactionsStoreConfig

const stableNoTransactions: StoredTransaction[] = []

export type TransactionsStoreEvents =
  | { type: 'mounted'; payload: StoredTransaction[] }
  | { type: 'updated'; payload: StoredTransaction }
  | { type: 'added'; payload: StoredTransaction }
  | { type: 'removed'; payload: StoredTransaction }
  | { type: 'cleared' }

type StoreContext = {
  user: Address
  chainId: number
  client: Client
}

export const createTransactionsStore = (_config?: Partial<TransactionsStoreConfig>) => {
  const config = { ...defaultConfig, ..._config }

  let ctx: StoreContext | undefined = undefined

  const txsStorage = createStorage(config.localStorageKey)
  let transactions = txsStorage.get()

  const listeners = createEventEmitter<TransactionsStoreEvents>()

  const updateUserTransactions = (
    user: Address,
    chainId: number,
    set: (txs: StoredTransaction[]) => StoredTransaction[],
  ) => {
    // get latest localstorage data (in case another tab updated it)
    const txs = txsStorage.get()

    txs[user] ??= {}
    txs[user][chainId] = set(txs[user]?.[chainId] || [])

    transactions = txs
    txsStorage.set(txs)
  }

  function addTransaction(newTx: NewTransaction) {
    if (!ctx) throw new Error('TransactionsStore not mounted')
    const { chainId, client, user } = ctx
    const tx = parseNewTransaction(newTx, config, ctx)
    updateUserTransactions(user, tx.chainId, (txs) =>
      [...txs.filter(({ hash }) => hash !== tx.hash), tx].slice(0, config.maxCompletedTransactions),
    )
    listeners.emit('added', tx)
    waitForTransaction(client, user, tx)
  }

  function getTransactions(user: Address = ctx?.user!, chainId: number = ctx?.chainId!) {
    return (transactions[user]?.[chainId] as StoredTransaction[]) || stableNoTransactions
  }

  function clearTransactions(user: Address = ctx?.user!, chainId: number = ctx?.chainId!) {
    updateUserTransactions(user, chainId, () => [])
    listeners.emit('cleared')
  }

  function removeTransaction(
    hash: StoredTransaction['hash'],
    user: Address = ctx?.user!,
    chainId: number = ctx?.chainId!,
  ) {
    const tx = getTransactions(user, chainId)?.find((tx) => tx.hash === hash)
    if (!tx) return
    updateUserTransactions(user, chainId, (txs) => txs.filter((tx) => tx.hash !== hash))
    listeners.emit('removed', tx)
  }

  function updateTransactionStatus({
    receipt,
    user,
    chainId,
  }: {
    receipt: TransactionReceipt
    user: Address
    chainId: number
  }) {
    const { transactionHash: hash, status } = receipt
    // maybe add gasUsed, gasPrice, blockNumber, etc (?)
    let updatedTx: StoredTransaction | undefined
    updateUserTransactions(user, chainId, (txs) => {
      const tx = txs.find((tx) => hash === tx.hash)
      if (!tx) return txs // if transaction is not in the store, it was cleared and we don't want to re-add it
      updatedTx = { ...tx, status }
      return [updatedTx, ...txs.filter(({ hash }) => hash !== tx.hash)]
    })
    if (updatedTx) listeners.emit('updated', updatedTx)
  }

  const pendingTxsCache: Map<string, Promise<void>> = new Map()
  async function waitForTransaction(client: Client, user: Address, tx: StoredTransaction) {
    if (pendingTxsCache.has(tx.hash)) return pendingTxsCache.get(tx.hash)
    const waitTxRequest = waitForTransactionReceipt(client, {
      hash: tx.hash,
      confirmations: tx.minConfirmations,
    }).then((receipt) => updateTransactionStatus({ receipt, user, chainId: tx.chainId }))
    pendingTxsCache.set(tx.hash, waitTxRequest)
    return waitTxRequest
  }

  function mount(client: Client, user: Address, chainId: number) {
    ctx = { user, chainId, client }
    const stateTxs = transactions[user]?.[chainId]
    if (stateTxs) {
      const pendingTxs = stateTxs.filter((tx) => tx.status === 'pending')
      Promise.all(pendingTxs.map((tx) => waitForTransaction(client, user, tx)))
    }
    listeners.emit('mounted', stateTxs)
  }

  function unmount() {
    ctx = undefined
    pendingTxsCache.clear()
    listeners.clear()
  }

  /* util to listen for any change */
  function onTransactionsChange(fn: () => void) {
    const unsubs = [
      listeners.on('updated', fn),
      listeners.on('added', fn),
      listeners.on('removed', fn),
      listeners.on('cleared', fn),
    ]
    return () => {
      unsubs.forEach((unsub) => unsub())
    }
  }

  return {
    addTransaction,
    getTransactions,
    clearTransactions,
    removeTransaction,
    onTransactionsChange,
    on: listeners.on,
    mount,
    unmount,
    /*
      allows directly modifiying the transactions of a user
      caution no events are emitted (react won't update your state)
    */
    '#updateUserTransactions': updateUserTransactions,
  }
}

export type TransactionStore = ReturnType<typeof createTransactionsStore>
