import React, { PropsWithChildren, useCallback, useEffect } from 'react'
import * as toast from '@zag-js/toast'
import type { RenderOptions, UserDefinedGroupContext } from '@zag-js/toast/dist/toast.types'
import { normalizeProps, useActor, useMachine } from '@zag-js/react'
import type { StoredTransaction } from '@pcnv/txs-core'
import { isMobile } from './utils'
import { useAccount } from 'wagmi'
import { useTransactionsStore } from '../Provider'

export type TransactionStatusToastProps<Meta = Record<string, string>> = Pick<
  RenderOptions,
  'onClose' | 'onClosing' | 'onOpen' | 'onUpdate' | 'dismiss'
> & {
  id: string
  type: 'stuck' | 'pending' | 'confirmed' | 'failed'
  transaction: StoredTransaction<Meta>
  description?: string
  title?: string
  rootProps?: React.HTMLAttributes<HTMLElement>
}

export type ToastsViewportProps<Meta> = PropsWithChildren<{
  TransactionStatusComponent: React.ComponentType<TransactionStatusToastProps<Meta>>
  placement?: toast.Placement
  /* 
    staleTime is how long the transaction remains relevant to display a status notification 
    in the case a user closed the app while the tx was pending, on reconnect if still in the staleTime window
    a toast will be displayed with the current status of the tx
    @default 2hrs
  */
  staleTime?: number
  /*
    should display a pending transaction toast every time the user opens the app
    and there are pending transactions, if false, only when the transaction is submitted will a toast be displayed
    (this does not stop the toast from being displayed when the transaction is confirmed/failed)
    @default true
  */
  showPendingOnReopen?: boolean
  /* 
    stuckTime is how long a transaction can be pending before it is considered stuck
    @default 30min
  */
  stuckTime?: number

  getDescription?: <Meta>(tx: StoredTransaction<Meta>) => string

  max?: UserDefinedGroupContext['max']
  gutter?: UserDefinedGroupContext['gutter']
  offsets?: UserDefinedGroupContext['offsets']
}>

const BaseToast = ({ actor }: { actor: toast.Service }) => {
  const [state, send] = useActor(actor)
  const api = toast.connect(state, send, normalizeProps)
  const toastElement = api.render()
  if (!toastElement) return null
  return React.cloneElement(toastElement, { rootProps: api.rootProps })
}

const two_hours = 1000 * 60 * 60 * 2
const half_hour = 1000 * 60 * 30
const five_seconds = 5 * 1000
const _gutter = '12px'
const _offsets = '12px'

const statusToToastType = {
  pending: 'loading',
  confirmed: 'success',
  failed: 'error',
} satisfies Record<StoredTransaction['status'], toast.Type>

export type DefaultToastTransactionMeta = { description: string }

/*
  removeDuplicateToasts
  is a workaround for a what looks like a bug in @zag-js/toast
  on development strict mode, react calls the useEffect twice
  so it mounts, unmounts and then mounts again the transactions store, 
  calling upsert for each pending tx twice (when showPendingOnReopen is true),
  this renders the same toast twice, so we filter out the duplicates
  
  api.upsert checks if the toast is visible (in state) to decide if it should update or create a new one
  but checking the api.toasts on the 'mounted' event returns nothing (both times)
*/
const removeDuplicateToasts = (toasts: toast.Service[]) =>
  toasts.filter((value, index, self) => index === self.findIndex((t) => t.id === value.id))

export function ToastsViewport<M extends StoredTransaction['meta'] = DefaultToastTransactionMeta>({
  TransactionStatusComponent,
  placement = 'top-end',
  staleTime = two_hours,
  showPendingOnReopen = true,
  stuckTime = half_hour,
  max = 6,
  gutter = _gutter,
  offsets = _offsets,
}: ToastsViewportProps<M>) {
  const [state, send] = useMachine(
    toast.group.machine({
      id: 'cnv-notifications',
      pauseOnPageIdle: true,
      pauseOnInteraction: true,
      max,
      gutter,
      offsets,
    }),
  )
  const api = toast.group.connect(state, send, normalizeProps)

  /* 
    metamask on mobile shows its own toast, so we disable ours
    maybe more connectors do this, we can add them here
  */
  const { connector } = useAccount()
  const disableToast = isMobile() && connector && ['metamask'].includes(connector.id)

  const upsertTxToast = useCallback(
    (tx?: StoredTransaction<M>) => {
      if (!tx || disableToast) return
      if (tx.sentAt < Date.now() - staleTime) return // too old, not relevant to show
      const isPending = tx.status === 'pending'
      const isStuck = stuckTime && isPending && tx.sentAt < Date.now() - stuckTime
      const type = isStuck ? 'stuck' : tx.status
      api.upsert({
        id: tx.hash,
        placement,
        type: statusToToastType[tx.status],
        duration: isPending ? Infinity : five_seconds,
        render: ({ id, onClose, onClosing, onOpen, onUpdate, dismiss }) => (
          <TransactionStatusComponent
            transaction={tx}
            type={type}
            description={tx.meta.description}
            {...{ id, onClose, onClosing, onOpen, onUpdate, dismiss }}
          />
        ),
      })
    },
    [api],
  )

  const store = useTransactionsStore()
  useEffect(() => {
    const events = [
      store.on('added', upsertTxToast),
      store.on('updated', upsertTxToast),
      store.on('removed', (tx?: StoredTransaction<M>) => tx && api.remove(tx.hash)),
      store.on('mounted', (txs?: StoredTransaction<M>[]) => {
        if (!txs || !showPendingOnReopen) return
        const pendingTxs = txs.filter((t) => t.status === 'pending')
        pendingTxs.forEach((tx) => upsertTxToast(tx))
      }),
    ]
    return () => {
      // unsubscribe from store events
      events.forEach((unsub) => unsub())
    }
  }, [api, upsertTxToast])

  return (
    <>
      {Object.entries(api.toastsByPlacement).map(([placement, toasts]) => (
        <div key={placement} {...api.getGroupProps({ placement: placement as toast.Placement })}>
          {removeDuplicateToasts(toasts).map((toastActor) => (
            <BaseToast key={toastActor.id} actor={toastActor} />
          ))}
        </div>
      ))}
    </>
  )
}

export { toast }
