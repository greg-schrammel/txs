import {
  createTransactionsStore,
  ToastsViewport,
  TransactionsStoreProvider,
  TransactionStatusToastProps,
} from '@pcnv/txs-react'
import { EmojiToast } from '@pcnv/txs-react/toasts/EmojiToast'
import '@pcnv/txs-react/toasts/EmojiToast/styles.css'
import { getDefaultConfig, RainbowKitProvider } from '@rainbow-me/rainbowkit'
import '@rainbow-me/rainbowkit/styles.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppProps } from 'next/app'
import { WagmiProvider } from 'wagmi'
import { arbitrum, base, mainnet, optimism, polygon, zora } from 'wagmi/chains'
import '../styles.css'

const config = getDefaultConfig({
  appName: 'My RainbowKit App',
  projectId: 'YOUR_PROJECT_ID',
  chains: [mainnet, polygon, optimism, arbitrum, base, zora],
  ssr: true,
})

const queryClient = new QueryClient()

const txsStore = createTransactionsStore()

const MyCustomNotification = (props: TransactionStatusToastProps) => {
  const tx = props.transaction
  return <EmojiToast {...props} description={tx.meta[tx.status]} />
}

declare global {
  namespace Txs {
    export interface Meta {
      pending: string
      success: string
      reverted: string
    }
  }
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <WagmiProvider config={config}>
        <RainbowKitProvider>
          <TransactionsStoreProvider store={txsStore}>
            <ToastsViewport TransactionStatusComponent={MyCustomNotification} placement="top-end" />
            <Component {...pageProps} />
          </TransactionsStoreProvider>
        </RainbowKitProvider>
      </WagmiProvider>
    </QueryClientProvider>
  )
}
