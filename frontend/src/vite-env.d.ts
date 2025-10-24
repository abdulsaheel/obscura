/// <reference types="vite/client" />

import { ExternalProvider } from '@ethersproject/providers'

interface ImportMetaEnv {
  readonly VITE_INDEXER_URL?: string
  readonly VITE_RPC_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare global {
  interface Window {
    ethereum?: ExternalProvider & {
      request: (args: { method: string; params?: any[] }) => Promise<any>
    }
  }
}