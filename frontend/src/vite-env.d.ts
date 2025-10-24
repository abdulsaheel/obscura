import { ExternalProvider } from '@ethersproject/providers'

declare global {
  interface Window {
    ethereum?: ExternalProvider & {
      request: (args: { method: string; params?: any[] }) => Promise<any>
    }
  }
}