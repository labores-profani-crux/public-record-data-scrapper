import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ReactNode } from 'react'
import { ThemeToggle } from '../ThemeToggle'

const mockSetTheme = vi.fn()
const mockTheme = vi.fn(() => 'light')

vi.mock('next-themes', () => ({
  useTheme: () => ({
    setTheme: mockSetTheme,
    theme: mockTheme()
  })
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    ...props
  }: {
    children: ReactNode
    onClick?: () => void
    [key: string]: unknown
  }) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  )
}))

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => (
    <div data-testid="dropdown">{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
    <div data-testid="dropdown-trigger">{children}</div>
  ),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => (
    <div data-testid="dropdown-content">{children}</div>
  ),
  DropdownMenuItem: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button data-testid="dropdown-item" onClick={onClick}>
      {children}
    </button>
  )
}))

vi.mock('@phosphor-icons/react', () => ({
  Sun: () => <span data-testid="sun-icon">Sun</span>,
  Moon: () => <span data-testid="moon-icon">Moon</span>
}))

describe('ThemeToggle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders dropdown menu', () => {
      render(<ThemeToggle />)

      expect(screen.getByTestId('dropdown')).toBeInTheDocument()
    })

    it('renders trigger button', () => {
      render(<ThemeToggle />)

      expect(screen.getByTestId('dropdown-trigger')).toBeInTheDocument()
    })

    it('renders sun and moon icons in trigger', () => {
      render(<ThemeToggle />)

      expect(screen.getAllByTestId('sun-icon').length).toBeGreaterThan(0)
      expect(screen.getAllByTestId('moon-icon').length).toBeGreaterThan(0)
    })

    it('renders screen reader text', () => {
      render(<ThemeToggle />)

      expect(screen.getByText('Toggle theme')).toBeInTheDocument()
    })

    it('renders three theme options', () => {
      render(<ThemeToggle />)

      expect(screen.getByText('Light')).toBeInTheDocument()
      expect(screen.getByText('Dark')).toBeInTheDocument()
      expect(screen.getByText('System')).toBeInTheDocument()
    })
  })

  describe('theme selection', () => {
    it('calls setTheme with "light" when Light is clicked', () => {
      render(<ThemeToggle />)

      const items = screen.getAllByTestId('dropdown-item')
      const lightItem = items.find((item) => item.textContent?.includes('Light'))
      fireEvent.click(lightItem!)

      expect(mockSetTheme).toHaveBeenCalledWith('light')
    })

    it('calls setTheme with "dark" when Dark is clicked', () => {
      render(<ThemeToggle />)

      const items = screen.getAllByTestId('dropdown-item')
      const darkItem = items.find((item) => item.textContent?.includes('Dark'))
      fireEvent.click(darkItem!)

      expect(mockSetTheme).toHaveBeenCalledWith('dark')
    })

    it('calls setTheme with "system" when System is clicked', () => {
      render(<ThemeToggle />)

      const items = screen.getAllByTestId('dropdown-item')
      const systemItem = items.find((item) => item.textContent?.includes('System'))
      fireEvent.click(systemItem!)

      expect(mockSetTheme).toHaveBeenCalledWith('system')
    })
  })
})
