import './globals.css'
import { AuthProvider } from '@/lib/AuthProvider'

export const metadata = {
  title: 'Family Admin Agent',
  description: 'Family Graph module',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
